import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, PhoneCall, PhoneIncoming, PhoneOff, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../Toast';
import {
  answerVoiceCall,
  subscribeStaffVoiceCalls,
  updateVoiceCallStatus,
  type ActiveCallController,
} from '../../services/voiceCallService';
import type { VoiceCallSession } from '../../types/domain';

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
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [answering, setAnswering] = useState(false);

  const controllerRef = useRef<ActiveCallController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!isStaff) return;
    const unsub = subscribeStaffVoiceCalls((list) => {
      setCalls(list);
    });
    return () => unsub();
  }, [isStaff]);

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

  const ringingCall = useMemo(
    () => calls.find((c) => c.status === 'ringing') || null,
    [calls]
  );

  if (!isStaff) return null;

  const staffRole: 'admin' | 'counter_staff' =
    profile?.role === 'counter_staff' ? 'counter_staff' : 'admin';

  const handleAnswer = async (call: VoiceCallSession) => {
    if (!profile || answering) return;
    setAnswering(true);
    setMuted(false);
    try {
      const controller = await answerVoiceCall({
        call,
        agentUid: profile.uid,
        agentName: profile.displayName || (staffRole === 'counter_staff' ? 'Counter Staff' : 'Admin'),
        agentRole: staffRole,
        onRemoteStream: (stream) => {
          if (audioRef.current) {
            audioRef.current.srcObject = stream;
            void audioRef.current.play().catch(() => {});
          }
        },
        onStatusChange: (status) => {
          if (status === 'ended' || status === 'declined' || status === 'missed') {
            setActiveCall(null);
            controllerRef.current = null;
          }
        },
        onError: (msg) => {
          notify('Voice call error', 'error', msg);
          setActiveCall(null);
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

  const handleToggleMute = () => {
    if (!controllerRef.current) return;
    setMuted(controllerRef.current.toggleMute());
  };

  const handleEnd = async () => {
    await controllerRef.current?.endCall();
    controllerRef.current = null;
    setActiveCall(null);
    setMuted(false);
  };

  if (!activeCall && !ringingCall) {
    return <audio ref={audioRef} autoPlay playsInline className="hidden" />;
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[340px] max-w-[calc(100vw-2rem)] no-print">
      <audio ref={audioRef} autoPlay playsInline className="hidden" />

      {activeCall ? (
        <div className="bg-[#0B1F3A] text-white border border-emerald-500/50 rounded-2xl shadow-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
                <PhoneCall className="w-4 h-4 animate-pulse" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{activeCall.callerName}</p>
                <p className="text-[11px] text-emerald-300 font-mono">
                  Live Voice Call · {formatDuration(seconds)}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleMute}
              className="flex-1 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {muted ? <MicOff className="w-3.5 h-3.5 text-amber-300" /> : <Mic className="w-3.5 h-3.5" />}
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button
              type="button"
              onClick={handleEnd}
              className="flex-1 h-9 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              End Call
            </button>
          </div>
        </div>
      ) : ringingCall ? (
        <div className="bg-[#0B1F3A] text-white border border-orange-500/60 rounded-2xl shadow-2xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center shrink-0 animate-bounce">
              <PhoneIncoming className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-orange-400">
                Incoming Passenger Call
              </p>
              <p className="text-sm font-bold truncate flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                {ringingCall.callerName}
              </p>
              {(ringingCall.callerPhone || ringingCall.callerEmail) && (
                <p className="text-[11px] text-slate-300 truncate">
                  {ringingCall.callerPhone || ringingCall.callerEmail}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={answering}
              onClick={() => handleAnswer(ringingCall)}
              className="flex-1 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              {answering ? 'Connecting...' : 'Answer'}
            </button>
            <button
              type="button"
              onClick={() => handleDecline(ringingCall.id)}
              className="flex-1 h-9 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              Decline
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
