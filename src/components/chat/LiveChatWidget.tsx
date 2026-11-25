import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bot,
  Headset,
  Loader2,
  LogIn,
  MailCheck,
  MessageCircle,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchCompanySettings, fetchRoutes } from '../../services/firestoreService';
import {
  createStaffChatAlertNotification,
  ensureChatSession,
  findLatestUserChatSession,
  getOrCreateLocalChatIdentity,
  requestAiChatReply,
  resetLocalChatIdentity,
  sendChatMessage,
  subscribeChatMessages,
  subscribeChatSession,
  triggerHumanSupportEmail,
  updateChatSessionMeta,
} from '../../services/chatService';
import {
  DEFAULT_SUPPORT_PHONE,
  startPassengerVoiceCall,
  toTelHref,
  type ActiveCallController,
} from '../../services/voiceCallService';
import type { ChatMessage, ChatSession, VoiceCallStatus } from '../../types/domain';

const QUICK_PROMPTS = [
  'ঢাকা থেকে কক্সবাজার বাস ও ভাড়া কত?',
  'টিকেট বাতিল ও রিফান্ড নিয়ম কী?',
  'PNR দিয়ে টিকেট ভেরিফাই করব কীভাবে?',
  'মানুষের সাহায্য লাগবে (Talk to Human)',
];

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function LiveChatWidget() {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const { data: settings } = useQuery({
    queryKey: ['company-settings'],
    queryFn: fetchCompanySettings,
    staleTime: 60_000,
  });
  const supportPhone = settings?.supportPhone || DEFAULT_SUPPORT_PHONE;

  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [chatError, setChatError] = useState('');
  const [localFallbackMsgs, setLocalFallbackMsgs] = useState<ChatMessage[]>([]);
  const [aiTyping, setAiTyping] = useState(false);
  const [routeSummary, setRouteSummary] = useState('');
  const [sessionId, setSessionId] = useState<string>('');
  const [visitorToken, setVisitorToken] = useState<string>('');

  // In-browser WebRTC live voice call state
  const [callStatus, setCallStatus] = useState<VoiceCallStatus | null>(null);
  const [callAgentName, setCallAgentName] = useState<string>('');
  const [callMuted, setCallMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [callError, setCallError] = useState('');
  const callControllerRef = useRef<ActiveCallController | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Reset state whenever user logs out
  useEffect(() => {
    if (!profile?.uid) {
      void callControllerRef.current?.endCall();
      callControllerRef.current = null;
      setCallStatus(null);
      setSession(null);
      setMessages([]);
      setLocalFallbackMsgs([]);
      setSessionId('');
      setVisitorToken('');
      setChatError('');
      return;
    }

    let active = true;
    const uid = profile.uid;
    async function initIdentity() {
      const local = getOrCreateLocalChatIdentity(uid);
      const existing = await findLatestUserChatSession(uid);
      if (!active) return;
      if (existing) {
        setSessionId(existing.id);
        setVisitorToken(existing.visitorToken);
      } else {
        setSessionId(local.sessionId);
        setVisitorToken(local.visitorToken);
      }
    }
    void initIdentity();
    return () => {
      active = false;
    };
  }, [profile?.uid]);

  // Call duration timer
  useEffect(() => {
    if (callStatus !== 'active') {
      setCallSeconds(0);
      return;
    }
    const timer = window.setInterval(() => {
      setCallSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [callStatus]);

  // Cleanup call on unmount
  useEffect(() => {
    return () => {
      void callControllerRef.current?.endCall();
    };
  }, []);

  // Load route summary once when signed-in user opens widget
  useEffect(() => {
    if (!open || !profile?.uid || routeSummary) return;
    fetchRoutes()
      .then((routes) => {
        if (!routes.length) return;
        const summary = routes
          .filter((r) => r.isActive)
          .slice(0, 12)
          .map((r) => `${r.originName} -> ${r.destinationName} (${r.estimatedDuration}, Base ৳${r.baseFare})`)
          .join('; ');
        setRouteSummary(summary);
      })
      .catch(() => {});
  }, [open, profile?.uid, routeSummary]);

  // Connect to Firestore session only for signed-in users
  useEffect(() => {
    if (!profile?.uid || !sessionId || !visitorToken) return;
    if (!open && !session) return;

    const currentProfile = profile;
    let unsubSession: (() => void) | undefined;
    let unsubMessages: (() => void) | undefined;
    let cancelled = false;

    async function connect() {
      setConnecting(true);
      setChatError('');
      const ensured = await ensureChatSession({
        sessionId,
        visitorToken,
        userId: currentProfile.uid,
        visitorName: currentProfile.displayName || currentProfile.email.split('@')[0] || 'Passenger',
        visitorEmail: currentProfile.email || undefined,
        visitorPhone: currentProfile.phone || undefined,
      });
      if (cancelled) return;
      setSession(ensured);
      setConnecting(false);

      unsubSession = subscribeChatSession(sessionId, (next) => {
        if (next) setSession(next);
      });
      unsubMessages = subscribeChatMessages(sessionId, (msgs) => {
        setMessages(msgs);
      });
    }

    connect().catch((err) => {
      console.error('Failed to connect live chat:', err);
      if (!cancelled) {
        setConnecting(false);
        setChatError('লাইভ চ্যাট ডাটাবেজ সংযোগে সমস্যা হয়েছে, তবে AI উত্তর দিতে প্রস্তুত।');
      }
    });

    return () => {
      cancelled = true;
      unsubSession?.();
      unsubMessages?.();
    };
  }, [open, profile?.uid, sessionId, visitorToken]);

  // Clear passenger unread counter when opened
  useEffect(() => {
    if (open && session && session.unreadForPassenger > 0) {
      updateChatSessionMeta(session.id, { unreadForPassenger: 0 }).catch(() => {});
    }
  }, [open, session?.id, session?.unreadForPassenger]);

  // Auto-scroll to latest message
  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, localFallbackMsgs.length, aiTyping, open]);

  const unreadCount = profile ? session?.unreadForPassenger || 0 : 0;

  const statusMeta = useMemo(() => {
    if (!profile) {
      return {
        label: 'Sign in required for Live Support',
        dot: 'bg-amber-400',
      };
    }
    if (callStatus === 'active') {
      return {
        label: `On Voice Call · ${callAgentName || 'Support'} (${formatDuration(callSeconds)})`,
        dot: 'bg-emerald-400 animate-pulse',
      };
    }
    if (callStatus === 'ringing') {
      return {
        label: 'Calling Admin / Bus Counter...',
        dot: 'bg-amber-400 animate-pulse',
      };
    }
    switch (session?.status) {
      case 'human_requested':
        return {
          label: 'Human Support Requested · Waiting for Admin/Counter',
          dot: 'bg-amber-400 animate-pulse',
        };
      case 'human_active':
        return {
          label: `Live Agent: ${session.assignedAgentName || 'Support Team'}`,
          dot: 'bg-emerald-400',
        };
      case 'resolved':
        return {
          label: 'Conversation Resolved',
          dot: 'bg-slate-400',
        };
      default:
        return {
          label: 'DeshLine AI Assistant · Instant Reply',
          dot: 'bg-emerald-400',
        };
    }
  }, [profile, callStatus, callAgentName, callSeconds, session?.status, session?.assignedAgentName]);

  const handleStartLiveVoiceCall = async () => {
    if (!profile || callStatus === 'ringing' || callStatus === 'active') return;
    setCallError('');
    setCallMuted(false);
    setCallStatus('ringing');
    setCallAgentName('');

    try {
      const controller = await startPassengerVoiceCall({
        callerUid: profile.uid,
        callerName: profile.displayName || profile.email.split('@')[0] || 'Passenger',
        callerEmail: profile.email || undefined,
        callerPhone: profile.phone || undefined,
        chatSessionId: session?.id ?? null,
        onRemoteStream: (stream) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = stream;
            void remoteAudioRef.current.play().catch(() => {});
          }
        },
        onStatusChange: (status, call) => {
          setCallStatus(status);
          if (call.calleeName) setCallAgentName(call.calleeName);
          if (status === 'declined') {
            setCallError('এই মুহূর্তে কোনো এজেন্ট কল রিসিভ করতে পারেননি। সরাসরি হটলাইন নম্বরে কল করতে পারেন।');
            callControllerRef.current = null;
          } else if (status === 'ended' || status === 'missed') {
            callControllerRef.current = null;
          }
        },
        onError: (msg) => {
          setCallError(msg);
          setCallStatus(null);
          callControllerRef.current = null;
        },
      });
      callControllerRef.current = controller;
    } catch (err) {
      setCallStatus(null);
      setCallError(err instanceof Error ? err.message : 'কল শুরু করা যায়নি।');
    }
  };

  const handleToggleMute = () => {
    if (!callControllerRef.current) return;
    const muted = callControllerRef.current.toggleMute();
    setCallMuted(muted);
  };

  const handleEndVoiceCall = async () => {
    await callControllerRef.current?.endCall();
    callControllerRef.current = null;
    setCallStatus(null);
    setCallMuted(false);
  };

  const escalateToHuman = async (triggerMessage: string, currentSession: ChatSession) => {
    if (!profile) return;
    const cleanName = profile.displayName || currentSession.visitorName || 'Passenger';
    const cleanEmail = profile.email || currentSession.visitorEmail || '';
    const cleanPhone = profile.phone || currentSession.visitorPhone || '';

    const handoffText =
      'আপনার অনুরোধটি আমাদের Admin এবং Bus Counter Support টিমের কাছে পাঠানো হয়েছে এবং সাইটের অফিশিয়াল মেইলে নোটিফিকেশন পাঠানো হয়েছে। অনুগ্রহ করে একটু অপেক্ষা করুন—কিছুক্ষণের মধ্যেই আমাদের একজন প্রতিনিধি এই চ্যাটে সরাসরি যুক্ত হবেন।';

    const updated = await sendChatMessage({
      session: currentSession,
      senderRole: 'ai',
      senderName: 'DeshLine AI Assistant',
      senderUid: null,
      text: handoffText,
      nextStatus: 'human_requested',
      humanRequested: true,
      visitorDetails: {
        visitorName: cleanName,
        ...(cleanEmail ? { visitorEmail: cleanEmail } : {}),
        ...(cleanPhone ? { visitorPhone: cleanPhone } : {}),
      },
    });

    await createStaffChatAlertNotification({
      sessionId: currentSession.id,
      visitorName: cleanName,
      message: triggerMessage,
    });

    try {
      const notifyRes = await triggerHumanSupportEmail({
        sessionId: currentSession.id,
        visitorName: cleanName,
        visitorEmail: cleanEmail || undefined,
        visitorPhone: cleanPhone || undefined,
        lastMessage: triggerMessage,
        transcript: [
          ...messages.slice(-8).map((m) => ({
            senderRole: m.senderRole,
            senderName: m.senderName,
            text: m.text,
          })),
          { senderRole: 'ai', senderName: 'DeshLine AI Assistant', text: updated.text },
        ],
      });
      await updateChatSessionMeta(currentSession.id, {
        emailNotificationStatus:
          notifyRes.channel === 'console_log' ? 'logged' : notifyRes.notified ? 'sent' : 'failed',
        emailNotificationNote: `${notifyRes.channel} -> ${notifyRes.recipient}`,
      });
    } catch {
      await updateChatSessionMeta(currentSession.id, {
        emailNotificationStatus: 'failed',
        emailNotificationNote: 'Email endpoint unreachable',
      }).catch(() => {});
    }
  };

  const handleSendText = async (rawText: string) => {
    const text = rawText.trim();
    if (!profile || !text || sending || !sessionId || !visitorToken) return;

    setSending(true);
    setInput('');
    setChatError('');

    const passengerName = profile.displayName || profile.email.split('@')[0] || 'Passenger';
    const optimisticUserMsg: ChatMessage = {
      id: `local_${Date.now()}_u`,
      sessionId,
      senderRole: 'passenger',
      senderName: passengerName,
      senderUid: profile.uid,
      text,
      createdAt: new Date().toISOString(),
    };

    try {
      const activeSession =
        session ||
        (await ensureChatSession({
          sessionId,
          visitorToken,
          userId: profile.uid,
          visitorName: passengerName,
          visitorEmail: profile.email || undefined,
          visitorPhone: profile.phone || undefined,
        }));
      if (!session) setSession(activeSession);

      const nextStatus = activeSession.status === 'resolved' ? 'ai_active' : activeSession.status;

      await sendChatMessage({
        session: activeSession,
        senderRole: 'passenger',
        senderName: passengerName,
        senderUid: profile.uid,
        text,
        nextStatus: activeSession.status === 'resolved' ? 'ai_active' : undefined,
        visitorDetails: {
          visitorName: passengerName,
          ...(profile.email ? { visitorEmail: profile.email } : {}),
          ...(profile.phone ? { visitorPhone: profile.phone } : {}),
        },
      });

      if (nextStatus === 'human_requested' || nextStatus === 'human_active') {
        return;
      }

      setAiTyping(true);
      const historyPayload = messages.slice(-10).map((m) => ({
        senderRole: m.senderRole,
        text: m.text,
      }));

      const aiRes = await requestAiChatReply({
        message: text,
        history: historyPayload,
        visitorName: passengerName,
        routeSummary,
      });

      if (aiRes.escalateToHuman) {
        await escalateToHuman(text, { ...activeSession, status: 'ai_active' });
      } else {
        await sendChatMessage({
          session: { ...activeSession, status: 'ai_active' },
          senderRole: 'ai',
          senderName: 'DeshLine AI Assistant',
          senderUid: null,
          text: aiRes.reply,
        });
      }
    } catch (err) {
      console.error('Chat send error:', err);
      setLocalFallbackMsgs((prev) => [...prev, optimisticUserMsg]);
      try {
        setAiTyping(true);
        const aiRes = await requestAiChatReply({
          message: text,
          history: [...messages, ...localFallbackMsgs].slice(-8).map((m) => ({
            senderRole: m.senderRole,
            text: m.text,
          })),
          visitorName: passengerName,
          routeSummary,
        });
        setLocalFallbackMsgs((prev) => [
          ...prev,
          {
            id: `local_${Date.now()}_a`,
            sessionId,
            senderRole: 'ai',
            senderName: 'DeshLine AI Assistant',
            senderUid: null,
            text: aiRes.reply,
            createdAt: new Date().toISOString(),
          },
        ]);
      } catch {
        setChatError('মেসেজ পাঠাতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।');
      }
    } finally {
      setAiTyping(false);
      setSending(false);
    }
  };

  const handleManualHumanClick = async () => {
    if (!profile || !session || sending) return;
    setSending(true);
    try {
      await sendChatMessage({
        session,
        senderRole: 'passenger',
        senderName: profile.displayName || session.visitorName,
        senderUid: profile.uid,
        text: 'আমি সরাসরি মানুষের (Admin / Counter Staff) সাথে কথা বলতে চাই।',
      });
      await escalateToHuman('Passenger clicked Talk to Human button', session);
    } finally {
      setSending(false);
    }
  };

  const displayedMessages = messages.length > 0 ? messages : localFallbackMsgs;

  const handleStartNewChat = async () => {
    if (!profile) return;
    const fresh = resetLocalChatIdentity(profile.uid);
    setMessages([]);
    setLocalFallbackMsgs([]);
    setChatError('');
    setSession(null);
    setSessionId(fresh.sessionId);
    setVisitorToken(fresh.visitorToken);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 no-print">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group relative flex items-center gap-2.5 px-4 py-3.5 rounded-full bg-[#0B1F3A] hover:bg-orange-600 text-white shadow-2xl border border-white/15 transition-all cursor-pointer"
          aria-label="Open Live AI Support Chat"
        >
          <span className="w-8 h-8 rounded-full bg-orange-600 group-hover:bg-white group-hover:text-orange-600 flex items-center justify-center transition-colors">
            <MessageCircle className="w-4 h-4" />
          </span>
          <div className="hidden sm:block text-left pr-1">
            <p className="text-xs font-bold leading-tight">AI Live Support</p>
            <p className="text-[10px] text-slate-300 group-hover:text-orange-100 leading-tight">
              Chat &amp; Voice Call
            </p>
          </div>
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center shadow">
              {unreadCount}
            </span>
          )}
        </button>
      ) : (
        <div className="w-[calc(100vw-2rem)] sm:w-[395px] h-[560px] max-h-[82vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-[#0B1F3A] text-white px-4 py-3.5 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-orange-600 flex items-center justify-center shrink-0">
                {callStatus === 'ringing' || callStatus === 'active' ? (
                  <PhoneCall className="w-4 h-4 animate-pulse" />
                ) : session?.status === 'human_active' || session?.status === 'human_requested' ? (
                  <Headset className="w-4 h-4" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate font-display">DeshLine Live Support</p>
                <p className="text-[11px] text-slate-300 flex items-center gap-1.5 truncate">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${statusMeta.dot}`} />
                  <span className="truncate">{statusMeta.label}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <a
                href={toTelHref(supportPhone)}
                title={`Call Hotline: ${supportPhone}`}
                className="p-1.5 rounded-lg text-emerald-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <PhoneCall className="w-4 h-4" />
              </a>
              {profile && (
                <button
                  type="button"
                  onClick={handleStartNewChat}
                  title="Start New Chat"
                  className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Close"
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!authLoading && !profile ? (
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center bg-slate-50/70 dark:bg-slate-950/40 space-y-5">
              <div className="w-14 h-14 rounded-2xl bg-orange-100 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <div className="space-y-2 max-w-xs">
                <h3 className="text-base font-extrabold text-slate-950 dark:text-white font-display">
                  লগইন বা সাইন-আপ প্রয়োজন
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  লাইভ AI এবং Bus Counter সাপোর্টে চ্যাট বা ব্রাউজার ভয়েস কল করতে আগে Sign In অথবা Create Account করুন। অথবা সরাসরি হটলাইনে কল করতে পারেন।
                </p>
              </div>
              <div className="w-full max-w-xs space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate('/login');
                  }}
                  className="w-full h-10 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  Sign In to Chat &amp; Call
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate('/register');
                  }}
                  className="w-full h-10 rounded-xl bg-[#0B1F3A] hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <UserPlus className="w-4 h-4 text-orange-400" />
                  Create Account (Sign Up)
                </button>
                <a
                  href={toTelHref(supportPhone)}
                  className="w-full h-10 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-emerald-100"
                >
                  <PhoneCall className="w-4 h-4" />
                  Call Hotline ({supportPhone})
                </a>
              </div>
            </div>
          ) : (
            <>
              {/* Human & Voice Call Action Bar */}
              <div className="px-3 py-2 bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
                {session?.status === 'human_requested' ? (
                  <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5 truncate">
                    <MailCheck className="w-3.5 h-3.5 shrink-0" />
                    Counter &amp; Admin notified
                  </span>
                ) : session?.status === 'human_active' ? (
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1.5 truncate">
                    <UserCheck className="w-3.5 h-3.5 shrink-0" />
                    {session.assignedAgentName || 'Support'}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                    <Sparkles className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    {profile?.displayName}
                  </span>
                )}

                <div className="flex items-center gap-1.5 shrink-0">
                  {callStatus !== 'ringing' && callStatus !== 'active' && (
                    <button
                      type="button"
                      onClick={handleStartLiveVoiceCall}
                      title="Start live browser voice call to Admin/Counter"
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <PhoneCall className="w-3 h-3" />
                      Voice Call
                    </button>
                  )}
                  {session?.status !== 'human_requested' && session?.status !== 'human_active' && (
                    <button
                      type="button"
                      onClick={handleManualHumanClick}
                      disabled={sending || !session}
                      className="px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Headset className="w-3 h-3" />
                      Human
                    </button>
                  )}
                </div>
              </div>

              {/* Active Voice Call Controls Banner */}
              {(callStatus === 'ringing' || callStatus === 'active') && (
                <div className="px-3.5 py-2.5 bg-emerald-950 text-white flex items-center justify-between gap-2 shrink-0">
                  <div className="min-w-0">
                    <p className="text-xs font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      {callStatus === 'ringing'
                        ? 'কল রিং হচ্ছে (Admin / Counter)...'
                        : `লাইভ ভয়েস কল · ${formatDuration(callSeconds)}`}
                    </p>
                    {callAgentName && (
                      <p className="text-[10px] text-emerald-300 truncate">Connected with {callAgentName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleToggleMute}
                      title={callMuted ? 'Unmute' : 'Mute'}
                      className="p-2 rounded-lg bg-white/15 hover:bg-white/25 cursor-pointer"
                    >
                      {callMuted ? <MicOff className="w-3.5 h-3.5 text-amber-300" /> : <Mic className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleEndVoiceCall}
                      title="End Call"
                      className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <PhoneOff className="w-3.5 h-3.5" />
                      End
                    </button>
                  </div>
                </div>
              )}

              {callError && (
                <div className="px-3.5 py-2 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900 text-[11px] text-red-700 dark:text-red-300 flex items-center justify-between gap-2 shrink-0">
                  <span>{callError}</span>
                  <a
                    href={toTelHref(supportPhone)}
                    className="px-2 py-1 rounded bg-red-600 text-white font-semibold shrink-0"
                  >
                    Call {supportPhone}
                  </a>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/60 dark:bg-slate-950/40">
                {(connecting || authLoading) && displayedMessages.length === 0 && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 px-1 py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-600" />
                    চ্যাট সংযুক্ত হচ্ছে...
                  </div>
                )}

                {chatError && (
                  <div className="text-[11px] px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200">
                    {chatError}
                  </div>
                )}

                {displayedMessages.map((m) => {
                  const isPassenger = m.senderRole === 'passenger';
                  const isStaff = m.senderRole === 'admin' || m.senderRole === 'counter_staff';
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isPassenger ? 'items-end' : 'items-start'}`}
                    >
                      <span className="text-[10px] font-semibold text-slate-400 mb-1 px-1 flex items-center gap-1">
                        {isStaff && <Headset className="w-3 h-3 text-emerald-500" />}
                        {m.senderRole === 'ai' && <Bot className="w-3 h-3 text-orange-500" />}
                        {m.senderName}
                        {m.senderRole === 'counter_staff' && ' (Bus Counter)'}
                        {m.senderRole === 'admin' && ' (Admin)'}
                        {' · '}
                        {formatTime(m.createdAt)}
                      </span>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                          isPassenger
                            ? 'bg-orange-600 text-white rounded-br-sm'
                            : isStaff
                              ? 'bg-[#0B1F3A] text-white border border-emerald-500/40 rounded-bl-sm'
                              : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-sm'
                        }`}
                      >
                        {m.text}
                      </div>
                    </div>
                  );
                })}

                {displayedMessages.length <= 1 && !aiTyping && !connecting && (
                  <div className="pt-1 flex flex-wrap gap-1.5">
                    {QUICK_PROMPTS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => handleSendText(q)}
                        className="text-left text-[11px] px-2.5 py-1.5 rounded-xl border border-orange-200 dark:border-orange-900/50 bg-orange-50/70 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-950/60 transition-colors cursor-pointer"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {aiTyping && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 px-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-600" />
                    AI উত্তর লিখছে...
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {/* Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSendText(input);
                }}
                className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    session?.status === 'human_active' || session?.status === 'human_requested'
                      ? 'Write a message to support agent...'
                      : 'আপনার প্রশ্ন লিখুন (Bangla / English)...'
                  }
                  className="flex-1 h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || sending}
                  aria-label="Send message"
                  className="w-10 h-10 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}
