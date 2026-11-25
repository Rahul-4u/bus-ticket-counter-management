import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, PhoneCall, PhoneIncoming, PhoneOff, Volume2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../Toast';
import {
  answerVoiceCall,
  requestDesktopCallNotifications,
  showIncomingCallDesktopAlert,
  startToneLoop,
  startVoiceCall,
  subscribeStaffVoiceCalls,
  toWhatsAppHref,
  unlockAudioElement,
  updateVoiceCallStatus,
  type ActiveCallController,
} from '../../services/voiceCallService';
import type { VoiceCallSession } from '../../types/domain';

export interface StaffCallRequestDetail {
  targetUid: string;
  passengerName: string;
  passengerPhone?: string;
  passengerEmail?: string;
  chatSessionId?: string;
}

export function triggerStaffVoiceCallToPassenger(detail: StaffCallRequestDetail) {
  window.dispatchEvent(new CustomEvent<StaffCallRequestDetail>('deshline:start-staff-call', { detail }));
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function StaffVoiceCallBanner() {
  const { profile } = useAuth();
  const { notify } = useToast();

  const isStaff = profile?.role === 'admin' || profile?.role === 'counter_staff';
  const [calls, setCalls] = useState<VoiceCallSession[]>([]);
  const [activeCall, setActiveCall] = useState<VoiceCallSession | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<{
    name: string;
    phone?: string;
    status: string;
  } | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [answering, setAnswering] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const controllerRef = useRef<ActiveCallController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Ask staff for Desktop Notification permission so incoming calls alert even in background tabs
  useEffect(() => {
    if (isStaff) {
      requestDesktopCallNotifications();
    }
  }, [isStaff]);

  // Bind remoteStream cleanly to persistent <audio> element (never unmounted)
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    if (!remoteStream) {
      audioEl.srcObject = null;
      setAudioBlocked(false);
      return;
    }
    audioEl.srcObject = remoteStream;
    audioEl.muted = false;
    audioEl.volume = 1.0;
    const playPromise = audioEl.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => setAudioBlocked(false))
        .catch(() => setAudioBlocked(true));
    }
  }, [remoteStream]);

  useEffect(() => {
    if (!isStaff) return;
    const unsub = subscribeStaffVoiceCalls((list) => {
      setCalls(list);
    });
    return () => unsub();
  }, [isStaff]);

  // Listen for outgoing Staff -> Passenger call requests from AdminLiveChatPage
  useEffect(() => {
    if (!isStaff || !profile) return;
    const staffRole: 'admin' | 'counter_staff' =
      profile.role === 'counter_staff' ? 'counter_staff' : 'admin';

    const handler = async (ev: Event) => {
      const detail = (ev as CustomEvent<StaffCallRequestDetail>).detail;
      if (!detail || controllerRef.current) return;
      unlockAudioElement(audioRef.current);
      setMuted(false);
      setRemoteStream(null);
      setOutgoingCall({
        name: detail.passengerName,
        phone: detail.passengerPhone,
        status: 'ringing',
      });

      try {
        const controller = await startVoiceCall({
          callerUid: profile.uid,
          callerName: profile.displayName || (staffRole === 'counter_staff' ? 'Bus Counter Staff' : 'DeshLine Admin'),
          callerRole: staffRole,
          callerEmail: profile.email || undefined,
          callerPhone: profile.phone || undefined,
          targetUid: detail.targetUid,
          chatSessionId: detail.chatSessionId ?? null,
          onRemoteStream: (stream) => {
            setRemoteStream(new MediaStream(stream.getTracks()));
          },
          onStatusChange: (status, call) => {
            if (status === 'active') {
              setOutgoingCall(null);
              setActiveCall({ ...call, callerName: detail.passengerName });
            } else if (status === 'declined' || status === 'missed' || status === 'ended') {
              setOutgoingCall(null);
              setActiveCall(null);
              setRemoteStream(null);
              controllerRef.current = null;
              if (status === 'declined') {
                notify(`${detail.passengerName} declined the call`, 'info');
              }
            }
          },
          onError: (msg) => {
            notify('Call error', 'error', msg);
            setOutgoingCall(null);
            setRemoteStream(null);
            controllerRef.current = null;
          },
        });
        controllerRef.current = controller;
      } catch (err) {
        setOutgoingCall(null);
        notify('Could not start voice call', 'error', err instanceof Error ? err.message : undefined);
      }
    };

    window.addEventListener('deshline:start-staff-call', handler);
    return () => window.removeEventListener('deshline:start-staff-call', handler);
  }, [isStaff, profile, notify]);

  const ringingCall = useMemo(
    () => calls.find((c) => c.status === 'ringing' && c.callerUid !== profile?.uid) || null,
    [calls, profile?.uid]
  );

  // WhatsApp-style incoming / dialing chime + desktop & tab title alert
  useEffect(() => {
    if (!isStaff) return;
    if (ringingCall && !activeCall) {
      const stopTone = startToneLoop('incoming');
      const stopAlert = showIncomingCallDesktopAlert(
        `Incoming Call: ${ringingCall.callerName}`,
        ringingCall.callerPhone
          ? `WhatsApp/Phone: ${ringingCall.callerPhone}`
          : 'A passenger is calling live support.'
      );
      return () => {
        stopTone();
        stopAlert();
      };
    }
    if (outgoingCall?.status === 'ringing') {
      return startToneLoop('dialing');
    }
  }, [isStaff, ringingCall?.id, activeCall?.id, outgoingCall?.status]);

  useEffect(() => {
    if (!activeCall) {
      setSeconds(0);
      return;
    }
    const timer = window.setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeCall?.id]);

  useEffect(() => {
    return () => {
      void controllerRef.current?.endCall();
    };
  }, []);

  if (!isStaff) return null;

  const staffRole: 'admin' | 'counter_staff' =
    profile?.role === 'counter_staff' ? 'counter_staff' : 'admin';

  const handleAnswer = async (call: VoiceCallSession) => {
    if (!profile || answering) return;
    unlockAudioElement(audioRef.current);
    setAnswering(true);
    setMuted(false);
    setRemoteStream(null);
    try {
      const controller = await answerVoiceCall({
        call,
        agentUid: profile.uid,
        agentName: profile.displayName || (staffRole === 'counter_staff' ? 'Counter Staff' : 'Admin'),
        agentRole: staffRole,
        onRemoteStream: (stream) => {
          setRemoteStream(new MediaStream(stream.getTracks()));
        },
        onStatusChange: (status) => {
          if (status === 'ended' || status === 'declined' || status === 'missed') {
            setActiveCall(null);
            setRemoteStream(null);
            controllerRef.current = null;
          }
        },
        onError: (msg) => {
          notify('Voice call error', 'error', msg);
          setActiveCall(null);
          setRemoteStream(null);
          controllerRef.current = null;
        },
      });
      controllerRef.current = controller;
      setActiveCall(call);
    } catch (err) {
      notify('Could not answer call', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setAnswering(false);
    }
  };

  const handleDecline = async (callId: string) => {
    await updateVoiceCallStatus(callId, 'declined').catch(() => {});
  };

  const handleEnableBlockedAudio = () => {
    unlockAudioElement(audioRef.current);
    setAudioBlocked(false);
  };

  const handleToggleMute = () => {
    if (!controllerRef.current) return;
    setMuted(controllerRef.current.toggleMute());
  };

  const handleEnd = async () => {
    await controllerRef.current?.endCall();
    controllerRef.current = null;
    setActiveCall(null);
    setOutgoingCall(null);
    setRemoteStream(null);
    setMuted(false);
  };

  const content = (
    <>
      {/* Persistent audio element always mounted */}
      <audio ref={audioRef} autoPlay playsInline className="hidden" />

      {/* Unmissable Full-Screen WhatsApp-Style Incoming Call Modal when Ringing */}
      {!activeCall && !outgoingCall && ringingCall && (
        <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 no-print">
          <div className="w-full max-w-sm bg-gradient-to-b from-[#0B1F3A] via-[#0F2C4C] to-[#071527] text-white rounded-3xl border border-emerald-500/50 shadow-2xl p-7 text-center space-y-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold">
              <PhoneIncoming className="w-3.5 h-3.5 animate-bounce" />
              Incoming Passenger Call
            </span>

            <div className="flex flex-col items-center space-y-3">
              <div className="relative flex items-center justify-center">
                <span className="absolute w-28 h-28 rounded-full bg-emerald-500/25 animate-ping" />
                <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-3xl font-extrabold shadow-xl border-2 border-white/25">
                  {(ringingCall.callerName[0] || 'P').toUpperCase()}
                </div>
              </div>
              <div>
                <h3 className="text-xl font-extrabold font-display">{ringingCall.callerName}</h3>
                {ringingCall.callerPhone && (
                  <p className="text-xs text-emerald-300 font-mono mt-1">
                    WhatsApp: {ringingCall.callerPhone}
                  </p>
                )}
                {ringingCall.callerEmail && (
                  <p className="text-[11px] text-slate-300 mt-0.5">{ringingCall.callerEmail}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center gap-10 pt-2">
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDecline(ringingCall.id)}
                  className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-xl cursor-pointer"
                  aria-label="Decline"
                >
                  <PhoneOff className="w-7 h-7" />
                </button>
                <span className="text-xs text-slate-300">Decline</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  disabled={answering}
                  onClick={() => handleAnswer(ringingCall)}
                  className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white flex items-center justify-center shadow-xl animate-pulse cursor-pointer"
                  aria-label="Accept Call"
                >
                  <PhoneCall className="w-7 h-7" />
                </button>
                <span className="text-xs text-emerald-300 font-bold">
                  {answering ? 'Connecting...' : 'Accept'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active / Outgoing Call Floating Card */}
      {(activeCall || outgoingCall) && (
        <div className="fixed bottom-5 right-5 z-[99995] w-[345px] max-w-[calc(100vw-2rem)] no-print">
          {activeCall ? (
            <div className="bg-gradient-to-b from-[#0B1F3A] to-[#071527] text-white border border-emerald-500/50 rounded-2xl shadow-2xl p-4 space-y-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-full bg-emerald-600 flex items-center justify-center text-base font-bold shrink-0">
                  {(activeCall.callerName[0] || 'P').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{activeCall.callerName}</p>
                  <p className="text-[11px] text-emerald-300 font-mono">
                    WhatsApp-style Voice · {formatDuration(seconds)}
                  </p>
                </div>
              </div>

              {audioBlocked && (
                <button
                  type="button"
                  onClick={handleEnableBlockedAudio}
                  className="w-full h-8 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold inline-flex items-center justify-center gap-1.5 animate-pulse cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" />
                  Tap to Hear Passenger Audio
                </button>
              )}

              <div className="flex items-center justify-center gap-4 pt-1">
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className={`w-11 h-11 rounded-full flex items-center justify-center cursor-pointer ${
                    muted ? 'bg-amber-500 text-slate-950' : 'bg-white/15 hover:bg-white/25 text-white'
                  }`}
                  title={muted ? 'Unmute' : 'Mute'}
                >
                  {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleEnd}
                  className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg cursor-pointer"
                  title="End Call"
                >
                  <PhoneOff className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={handleEnableBlockedAudio}
                  className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
                  title="Speaker"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : outgoingCall ? (
            <div className="bg-gradient-to-b from-[#0B1F3A] to-[#071527] text-white border border-emerald-500/50 rounded-2xl shadow-2xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-full bg-emerald-600 flex items-center justify-center shrink-0 animate-pulse">
                  <PhoneCall className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                    Calling Passenger...
                  </p>
                  <p className="text-sm font-bold truncate">{outgoingCall.name}</p>
                </div>
              </div>
              {outgoingCall.phone && (
                <a
                  href={toWhatsAppHref(outgoingCall.phone, `Hello ${outgoingCall.name}, DeshLine Support calling you.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  Passenger offline? Call WhatsApp ({outgoingCall.phone})
                </a>
              )}
              <button
                type="button"
                onClick={handleEnd}
                className="w-full h-9 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <PhoneOff className="w-4 h-4" />
                Cancel Call
              </button>
            </div>
          ) : null}
        </div>
      )}
    </>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
