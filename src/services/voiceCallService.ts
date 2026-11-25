import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
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
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
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

/**
 * Unlocks HTMLAudioElement playback inside a user click gesture so later
 * asynchronous WebRTC remote audio streams play cleanly without autoplay blocks.
 */
export function unlockAudioElement(el: HTMLAudioElement | null): void {
  if (!el) return;
  try {
    el.muted = false;
    el.volume = 1.0;
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {});
    }
  } catch {
    // Ignore
  }
}

/**
 * Generates a gentle WhatsApp-style ringback / incoming chime using Web Audio API.
 */
export function startToneLoop(kind: 'dialing' | 'incoming'): () => void {
  if (typeof window === 'undefined') return () => {};
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return () => {};

  let ctx: AudioContext | null = null;
  let timerId: number | null = null;
  let stopped = false;

  const playPulse = () => {
    if (stopped) return;
    try {
      if (!ctx) ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      const freqs = kind === 'incoming' ? [523.25, 659.25] : [440, 480];
      const dur = kind === 'incoming' ? 0.35 : 0.7;

      freqs.forEach((f, idx) => {
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        const startAt = kind === 'incoming' ? now + idx * 0.18 : now;
        gain.gain.setValueAtTime(0.001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.045, startAt + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startAt);
        osc.stop(startAt + dur + 0.02);
      });
    } catch {
      // Ignore Web Audio errors if blocked before gesture
    }
  };

  playPulse();
  timerId = window.setInterval(playPulse, kind === 'incoming' ? 2200 : 2800);

  return () => {
    stopped = true;
    if (timerId !== null) window.clearInterval(timerId);
    if (ctx) {
      ctx.close().catch(() => {});
      ctx = null;
    }
  };
}

async function getMicrophoneStream(): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('আপনার ব্রাউজার লাইভ ভয়েস কল সাপোর্ট করে না। অনুগ্রহ করে সরাসরি হটলাইন নম্বরে কল করুন।');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  } catch {
    throw new Error('মাইক্রোফোন অ্যাক্সেস পাওয়া যায়নি। ব্রাউজারে Microphone permission দিন অথবা সরাসরি হটলাইনে কল করুন।');
  }
}

function attachRemoteIceQueue(
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

export async function startVoiceCall(params: {
  callerUid: string;
  callerName: string;
  callerRole: 'passenger' | 'admin' | 'counter_staff';
  callerEmail?: string;
  callerPhone?: string;
  targetUid?: string | null;
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
  let callDocReady = false;
  const bufferedLocalCandidates: VoiceCallCandidate[] = [];
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
    const incomingTracks =
      event.streams && event.streams[0]?.getTracks().length
        ? event.streams[0].getTracks()
        : [event.track];
    let added = false;
    incomingTracks.forEach((track) => {
      if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
        remoteStream.addTrack(track);
        added = true;
      }
    });
    if (added || remoteStream.getTracks().length > 0) {
      params.onRemoteStream(remoteStream);
    }
  };

  const writeLocalCandidate = (cand: VoiceCallCandidate) => {
    setDoc(doc(db, 'voice_calls', callId, 'callerCandidates', cand.id), cand).catch((err) => {
      console.error('Failed writing caller ICE candidate:', err);
    });
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    const candData: VoiceCallCandidate = {
      id: randomId('cand'),
      candidate: event.candidate.candidate,
      sdpMid: event.candidate.sdpMid ?? null,
      sdpMLineIndex: event.candidate.sdpMLineIndex ?? null,
      createdAt: new Date().toISOString(),
    };
    if (callDocReady) {
      writeLocalCandidate(candData);
    } else {
      // Buffer until voice_calls/{callId} exists so Firestore rules never reject early ICE candidates
      bufferedLocalCandidates.push(candData);
    }
  };

  try {
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);

    const now = new Date().toISOString();
    const callDoc: VoiceCallSession = {
      id: callId,
      chatSessionId: params.chatSessionId ?? null,
      callerUid: params.callerUid,
      callerName: params.callerName.trim().slice(0, 120) || 'User',
      callerRole: params.callerRole,
      ...(params.callerEmail ? { callerEmail: params.callerEmail.trim().slice(0, 200) } : {}),
      ...(params.callerPhone ? { callerPhone: params.callerPhone.trim().slice(0, 32) } : {}),
      targetUid: params.targetUid ?? null,
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
    callDocReady = true;

    // Flush any ICE candidates collected while setDoc was in flight
    while (bufferedLocalCandidates.length > 0) {
      const next = bufferedLocalCandidates.shift();
      if (next) writeLocalCandidate(next);
    }

    if (params.callerRole === 'passenger') {
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
    }

    const candQueue = attachRemoteIceQueue(pc, callId, 'calleeCandidates');
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
  agentRole: 'admin' | 'counter_staff' | 'passenger';
  onRemoteStream: (stream: MediaStream) => void;
  onStatusChange: (status: VoiceCallStatus, call: VoiceCallSession) => void;
  onError: (message: string) => void;
}): Promise<ActiveCallController> {
  const localStream = await getMicrophoneStream();
  const callId = params.call.id;
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const remoteStream = new MediaStream();
  let cleanedUp = false;
  let answerSaved = false;
  const bufferedLocalCandidates: VoiceCallCandidate[] = [];
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
    const incomingTracks =
      event.streams && event.streams[0]?.getTracks().length
        ? event.streams[0].getTracks()
        : [event.track];
    let added = false;
    incomingTracks.forEach((track) => {
      if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
        remoteStream.addTrack(track);
        added = true;
      }
    });
    if (added || remoteStream.getTracks().length > 0) {
      params.onRemoteStream(remoteStream);
    }
  };

  const writeCalleeCandidate = (cand: VoiceCallCandidate) => {
    setDoc(doc(db, 'voice_calls', callId, 'calleeCandidates', cand.id), cand).catch((err) => {
      console.error('Failed writing callee ICE candidate:', err);
    });
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    const candData: VoiceCallCandidate = {
      id: randomId('cand'),
      candidate: event.candidate.candidate,
      sdpMid: event.candidate.sdpMid ?? null,
      sdpMLineIndex: event.candidate.sdpMLineIndex ?? null,
      createdAt: new Date().toISOString(),
    };
    if (answerSaved) {
      writeCalleeCandidate(candData);
    } else {
      bufferedLocalCandidates.push(candData);
    }
  };

  try {
    const candQueue = attachRemoteIceQueue(pc, callId, 'callerCandidates');
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
    answerSaved = true;

    while (bufferedLocalCandidates.length > 0) {
      const next = bufferedLocalCandidates.shift();
      if (next) writeCalleeCandidate(next);
    }

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

export function subscribePassengerIncomingCalls(
  uid: string,
  onUpdate: (incomingCall: VoiceCallSession | null) => void
): Unsubscribe {
  const q = query(
    collection(db, 'voice_calls'),
    where('targetUid', '==', uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as VoiceCallSession)
        .filter((c) => c.status === 'ringing')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onUpdate(list[0] || null);
    },
    (err) => {
      console.error('Passenger incoming call listener error:', err);
    }
  );
}
