import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  AppNotification,
  VoiceCallCandidate,
  VoiceCallSession,
  VoiceCallStatus,
} from '../types/domain';

export const DEFAULT_SUPPORT_PHONE = '+880 1700-000999';

export function toTelHref(phone?: string): string {
  const cleaned = (phone || DEFAULT_SUPPORT_PHONE).replace(/[^+\d]/g, '');
  return `tel:${cleaned || '+8801700000999'}`;
}

export function toWhatsAppHref(phone?: string, text?: string): string {
  const digits = (phone || DEFAULT_SUPPORT_PHONE).replace(/[^\d]/g, '');
  const normalized = digits.startsWith('0') ? `88${digits}` : digits;
  const base = `https://wa.me/${normalized || '8801700000999'}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

function randomId(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${uuid}`.slice(0, 64);
}

export interface ActiveCallController {
  callId: string;
  toggleMute: () => boolean;
  endCall: () => Promise<void>;
}

async function getMicrophoneStream(): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('আপনার ব্রাউজার লাইভ ভয়েস কল সাপোর্ট করে না। অনুগ্রহ করে সরাসরি হটলাইন নম্বরে কল করুন।');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch {
    throw new Error('মাইক্রোফোন অ্যাক্সেস পাওয়া যায়নি। ব্রাউজারে Microphone permission দিন অথবা সরাসরি হটলাইনে কল করুন।');
  }
}

function attachIceCandidateQueue(
  pc: RTCPeerConnection,
  callId: string,
  subcollection: 'callerCandidates' | 'calleeCandidates'
): { unsub: Unsubscribe; flush: () => Promise<void> } {
  const seen = new Set<string>();
  const pending: RTCIceCandidateInit[] = [];

  const flush = async () => {
    if (!pc.remoteDescription) return;
    while (pending.length > 0) {
      const next = pending.shift();
      if (next) {
        await pc.addIceCandidate(new RTCIceCandidate(next)).catch(() => {});
      }
    }
  };

  const unsub = onSnapshot(collection(db, 'voice_calls', callId, subcollection), (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type !== 'added') return;
      if (seen.has(change.doc.id)) return;
      seen.add(change.doc.id);
      const data = change.doc.data() as VoiceCallCandidate;
      const init: RTCIceCandidateInit = {
        candidate: data.candidate,
        sdpMid: data.sdpMid,
        sdpMLineIndex: data.sdpMLineIndex,
      };
      if (pc.remoteDescription) {
        pc.addIceCandidate(new RTCIceCandidate(init)).catch(() => {});
      } else {
        pending.push(init);
      }
    });
  });

  return { unsub, flush };
}

export async function startPassengerVoiceCall(params: {
  callerUid: string;
  callerName: string;
  callerEmail?: string;
  callerPhone?: string;
  chatSessionId?: string | null;
  onRemoteStream: (stream: MediaStream) => void;
  onStatusChange: (status: VoiceCallStatus, call: VoiceCallSession) => void;
  onError: (message: string) => void;
}): Promise<ActiveCallController> {
  const localStream = await getMicrophoneStream();
  const callId = randomId('call');
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const remoteStream = new MediaStream();
  let cleanedUp = false;
  let unsubCall: Unsubscribe | undefined;
  let unsubCalleeCand: Unsubscribe | undefined;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    unsubCall?.();
    unsubCalleeCand?.();
    localStream.getTracks().forEach((t) => t.stop());
    pc.close();
  };

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  pc.ontrack = (event) => {
    event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
    params.onRemoteStream(remoteStream);
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    const candId = randomId('cand');
    const docData: VoiceCallCandidate = {
      id: candId,
      candidate: event.candidate.candidate,
      sdpMid: event.candidate.sdpMid ?? null,
      sdpMLineIndex: event.candidate.sdpMLineIndex ?? null,
      createdAt: new Date().toISOString(),
    };
    setDoc(doc(db, 'voice_calls', callId, 'callerCandidates', candId), docData).catch(() => {});
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const now = new Date().toISOString();
    const callDoc: VoiceCallSession = {
      id: callId,
      chatSessionId: params.chatSessionId ?? null,
      callerUid: params.callerUid,
      callerName: params.callerName.trim().slice(0, 120) || 'Passenger',
      ...(params.callerEmail ? { callerEmail: params.callerEmail.trim().slice(0, 200) } : {}),
      ...(params.callerPhone ? { callerPhone: params.callerPhone.trim().slice(0, 32) } : {}),
      calleeUid: null,
      calleeName: null,
      calleeRole: null,
      status: 'ringing',
      offer: {
        type: offer.type,
        sdp: offer.sdp || '',
      },
      answer: null,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'voice_calls', callId), callDoc);

    // Broadcast live call notification to Admin & Counter Staff
    const notifId = randomId('notif');
    const notif: AppNotification = {
      id: notifId,
      targetUid: 'staff_broadcast',
      targetRole: 'counter_staff',
      title: `Incoming Voice Call: ${callDoc.callerName}`,
      message: `${callDoc.callerName} is calling live support from the website.`,
      type: 'system',
      isRead: false,
      createdAt: now,
    };
    setDoc(doc(db, 'notifications', notifId), notif).catch(() => {});

    const candQueue = attachIceCandidateQueue(pc, callId, 'calleeCandidates');
    unsubCalleeCand = candQueue.unsub;

    unsubCall = onSnapshot(doc(db, 'voice_calls', callId), async (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as VoiceCallSession;
      if (data.answer && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer as RTCSessionDescriptionInit)).catch(() => {});
        await candQueue.flush();
      }
      params.onStatusChange(data.status, data);
      if (data.status === 'ended' || data.status === 'declined' || data.status === 'missed') {
        cleanup();
      }
    });

    return {
      callId,
      toggleMute: () => {
        const nextMuted = localStream.getAudioTracks().every((t) => t.enabled);
        localStream.getAudioTracks().forEach((t) => {
          t.enabled = !nextMuted;
        });
        return nextMuted;
      },
      endCall: async () => {
        await updateVoiceCallStatus(callId, 'ended').catch(() => {});
        cleanup();
      },
    };
  } catch (err) {
    cleanup();
    const msg = err instanceof Error ? err.message : 'Unable to start voice call';
    params.onError(msg);
    throw err;
  }
}

export async function answerVoiceCall(params: {
  call: VoiceCallSession;
  agentUid: string;
  agentName: string;
  agentRole: 'admin' | 'counter_staff';
  onRemoteStream: (stream: MediaStream) => void;
  onStatusChange: (status: VoiceCallStatus, call: VoiceCallSession) => void;
  onError: (message: string) => void;
}): Promise<ActiveCallController> {
  const localStream = await getMicrophoneStream();
  const callId = params.call.id;
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const remoteStream = new MediaStream();
  let cleanedUp = false;
  let unsubCall: Unsubscribe | undefined;
  let unsubCallerCand: Unsubscribe | undefined;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    unsubCall?.();
    unsubCallerCand?.();
    localStream.getTracks().forEach((t) => t.stop());
    pc.close();
  };

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  pc.ontrack = (event) => {
    event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
    params.onRemoteStream(remoteStream);
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    const candId = randomId('cand');
    const docData: VoiceCallCandidate = {
      id: candId,
      candidate: event.candidate.candidate,
      sdpMid: event.candidate.sdpMid ?? null,
      sdpMLineIndex: event.candidate.sdpMLineIndex ?? null,
      createdAt: new Date().toISOString(),
    };
    setDoc(doc(db, 'voice_calls', callId, 'calleeCandidates', candId), docData).catch(() => {});
  };

  try {
    const candQueue = attachIceCandidateQueue(pc, callId, 'callerCandidates');
    unsubCallerCand = candQueue.unsub;

    await pc.setRemoteDescription(new RTCSessionDescription(params.call.offer as RTCSessionDescriptionInit));
    await candQueue.flush();

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await updateDoc(doc(db, 'voice_calls', callId), {
      status: 'active',
      calleeUid: params.agentUid,
      calleeName: params.agentName,
      calleeRole: params.agentRole,
      answer: {
        type: answer.type,
        sdp: answer.sdp || '',
      },
      updatedAt: new Date().toISOString(),
    });

    unsubCall = onSnapshot(doc(db, 'voice_calls', callId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as VoiceCallSession;
      params.onStatusChange(data.status, data);
      if (data.status === 'ended' || data.status === 'declined' || data.status === 'missed') {
        cleanup();
      }
    });

    return {
      callId,
      toggleMute: () => {
        const nextMuted = localStream.getAudioTracks().every((t) => t.enabled);
        localStream.getAudioTracks().forEach((t) => {
          t.enabled = !nextMuted;
        });
        return nextMuted;
      },
      endCall: async () => {
        await updateVoiceCallStatus(callId, 'ended').catch(() => {});
        cleanup();
      },
    };
  } catch (err) {
    cleanup();
    const msg = err instanceof Error ? err.message : 'Unable to answer voice call';
    params.onError(msg);
    throw err;
  }
}

export async function updateVoiceCallStatus(callId: string, status: VoiceCallStatus): Promise<void> {
  const now = new Date().toISOString();
  await updateDoc(doc(db, 'voice_calls', callId), {
    status,
    updatedAt: now,
    ...(status === 'ended' || status === 'declined' || status === 'missed' ? { endedAt: now } : {}),
  });
}

export function subscribeStaffVoiceCalls(
  onUpdate: (calls: VoiceCallSession[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'voice_calls'), orderBy('updatedAt', 'desc'), limit(25));
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(snap.docs.map((d) => d.data() as VoiceCallSession));
    },
    (err) => {
      console.error('Staff voice calls listener error:', err);
      onError?.(err);
    }
  );
}
