import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Headset,
  Loader2,
  MailCheck,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchRoutes } from '../../services/firestoreService';
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
import type { ChatMessage, ChatSession } from '../../types/domain';

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

export function LiveChatWidget() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [chatError, setChatError] = useState('');
  const [localFallbackMsgs, setLocalFallbackMsgs] = useState<ChatMessage[]>([]);
  const [aiTyping, setAiTyping] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [routeSummary, setRouteSummary] = useState('');
  const [sessionId, setSessionId] = useState<string>('');
  const [visitorToken, setVisitorToken] = useState<string>('');
  const endRef = useRef<HTMLDivElement | null>(null);

  // Initialize chat identity (reuse signed-in user's latest session if available, else localStorage)
  useEffect(() => {
    let active = true;
    async function initIdentity() {
      const local = getOrCreateLocalChatIdentity(profile?.uid);
      if (profile?.uid) {
        const existing = await findLatestUserChatSession(profile.uid);
        if (active && existing) {
          setSessionId(existing.id);
          setVisitorToken(existing.visitorToken);
          return;
        }
      }
      if (active) {
        setSessionId(local.sessionId);
        setVisitorToken(local.visitorToken);
      }
    }
    void initIdentity();
    return () => {
      active = false;
    };
  }, [profile?.uid]);

  // Load route summary once when widget opens for richer AI answers
  useEffect(() => {
    if (!open || routeSummary) return;
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
  }, [open, routeSummary]);

  // Ensure Firestore session exists and subscribe in real-time when widget is opened (or session already initialized)
  useEffect(() => {
    if (!sessionId || !visitorToken) return;
    if (!open && !session) return;

    let unsubSession: (() => void) | undefined;
    let unsubMessages: (() => void) | undefined;
    let cancelled = false;

    async function connect() {
      setConnecting(true);
      setChatError('');
      const initialName = profile?.displayName || guestName.trim() || 'Passenger Guest';
      const ensured = await ensureChatSession({
        sessionId,
        visitorToken,
        userId: profile?.uid ?? null,
        visitorName: initialName,
        visitorEmail: profile?.email || guestEmail.trim() || undefined,
        visitorPhone: profile?.phone || guestPhone.trim() || undefined,
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
  }, [open, sessionId, visitorToken, profile?.uid]);

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
  }, [messages.length, aiTyping, open]);

  const unreadCount = session?.unreadForPassenger || 0;

  const statusMeta = useMemo(() => {
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
  }, [session?.status, session?.assignedAgentName]);

  const escalateToHuman = async (triggerMessage: string, currentSession: ChatSession) => {
    const cleanName = profile?.displayName || guestName.trim() || currentSession.visitorName || 'Passenger Guest';
    const cleanEmail = profile?.email || guestEmail.trim() || currentSession.visitorEmail || '';
    const cleanPhone = profile?.phone || guestPhone.trim() || currentSession.visitorPhone || '';

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
    if (!text || sending || !sessionId || !visitorToken) return;

    setSending(true);
    setInput('');
    setChatError('');

    const passengerName = profile?.displayName || guestName.trim() || session?.visitorName || 'Passenger Guest';
    const optimisticUserMsg: ChatMessage = {
      id: `local_${Date.now()}_u`,
      sessionId,
      senderRole: 'passenger',
      senderName: passengerName,
      senderUid: profile?.uid ?? null,
      text,
      createdAt: new Date().toISOString(),
    };

    try {
      const activeSession =
        session ||
        (await ensureChatSession({
          sessionId,
          visitorToken,
          userId: profile?.uid ?? null,
          visitorName: passengerName,
          visitorEmail: profile?.email || guestEmail.trim() || undefined,
          visitorPhone: profile?.phone || guestPhone.trim() || undefined,
        }));
      if (!session) setSession(activeSession);

      const nextStatus = activeSession.status === 'resolved' ? 'ai_active' : activeSession.status;

      await sendChatMessage({
        session: activeSession,
        senderRole: 'passenger',
        senderName: passengerName,
        senderUid: profile?.uid ?? null,
        text,
        nextStatus: activeSession.status === 'resolved' ? 'ai_active' : undefined,
        visitorDetails: {
          visitorName: passengerName,
          ...(profile?.email || guestEmail.trim()
            ? { visitorEmail: profile?.email || guestEmail.trim() }
            : {}),
          ...(profile?.phone || guestPhone.trim()
            ? { visitorPhone: profile?.phone || guestPhone.trim() }
            : {}),
        },
      });

      // If a human agent is already requested or active, do not run AI auto-reply
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
      // Fallback: show passenger message & AI reply locally so chat never appears blank
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
    if (!session || sending) return;
    if (!profile && !guestPhone.trim() && !guestEmail.trim() && !session.visitorPhone && !session.visitorEmail) {
      setShowContactForm(true);
      return;
    }
    setSending(true);
    try {
      await sendChatMessage({
        session,
        senderRole: 'passenger',
        senderName: profile?.displayName || guestName.trim() || session.visitorName,
        senderUid: profile?.uid ?? null,
        text: 'আমি সরাসরি মানুষের (Admin / Counter Staff) সাথে কথা বলতে চাই।',
      });
      await escalateToHuman('Passenger clicked Talk to Human button', session);
    } finally {
      setSending(false);
    }
  };

  const handleSaveGuestContactAndEscalate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setShowContactForm(false);
    setSending(true);
    try {
      const updatedName = guestName.trim() || session.visitorName;
      const updatedSession: ChatSession = {
        ...session,
        visitorName: updatedName,
        visitorPhone: guestPhone.trim() || session.visitorPhone,
        visitorEmail: guestEmail.trim() || session.visitorEmail,
      };
      await updateChatSessionMeta(session.id, {
        visitorName: updatedName,
        ...(guestPhone.trim() ? { visitorPhone: guestPhone.trim() } : {}),
        ...(guestEmail.trim() ? { visitorEmail: guestEmail.trim() } : {}),
      });
      await sendChatMessage({
        session: updatedSession,
        senderRole: 'passenger',
        senderName: updatedName,
        senderUid: profile?.uid ?? null,
        text: `আমার মানুষের সাহায্য লাগবে। নাম: ${updatedName}${guestPhone.trim() ? `, ফোন: ${guestPhone.trim()}` : ''}`,
      });
      await escalateToHuman('Passenger requested human support with contact details', updatedSession);
    } finally {
      setSending(false);
    }
  };

  const displayedMessages = messages.length > 0 ? messages : localFallbackMsgs;

  const handleStartNewChat = async () => {
    const fresh = resetLocalChatIdentity(profile?.uid);
    setMessages([]);
    setLocalFallbackMsgs([]);
    setChatError('');
    setSession(null);
    setSessionId(fresh.sessionId);
    setVisitorToken(fresh.visitorToken);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 no-print">
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
              24/7 AI + Counter Help
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
                {session?.status === 'human_active' || session?.status === 'human_requested' ? (
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
              <button
                type="button"
                onClick={handleStartNewChat}
                title="Start New Chat"
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
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

          {/* Human Escalation Banner */}
          <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
            {session?.status === 'human_requested' ? (
              <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5">
                <MailCheck className="w-3.5 h-3.5 shrink-0" />
                Counter &amp; Admin notified — waiting for agent
              </span>
            ) : session?.status === 'human_active' ? (
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 shrink-0" />
                Live human chat active ({session.assignedAgentName || 'Support'})
              </span>
            ) : (
              <>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                  Bangla &amp; English AI Support
                </span>
                <button
                  type="button"
                  onClick={handleManualHumanClick}
                  disabled={sending}
                  className="px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Headset className="w-3 h-3" />
                  Talk to Human
                </button>
              </>
            )}
          </div>

          {/* Optional Guest Info Capture Form on Human Request */}
          {showContactForm && (
            <form
              onSubmit={handleSaveGuestContactAndEscalate}
              className="p-3.5 bg-orange-50/90 dark:bg-orange-950/30 border-b border-orange-200 dark:border-orange-900/50 space-y-2 shrink-0"
            >
              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                আপনার নাম ও ফোন/ইমেইল দিন যাতে Counter Staff যোগাযোগ করতে পারেন:
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  required
                  placeholder="আপনার নাম"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
                <input
                  required
                  placeholder="ফোন (017...)"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  className="h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>
              <input
                type="email"
                placeholder="ইমেইল (ঐচ্ছিক)"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className="w-full h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 h-8 rounded-lg bg-orange-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Connect to Human Agent
                </button>
                <button
                  type="button"
                  onClick={() => setShowContactForm(false)}
                  className="px-3 h-8 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/60 dark:bg-slate-950/40">
            {connecting && displayedMessages.length === 0 && (
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

            {displayedMessages.length <= 1 && !aiTyping && (
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
        </div>
      )}
    </div>
  );
}
