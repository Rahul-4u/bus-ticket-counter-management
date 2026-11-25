import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bot,
  CheckCircle2,
  Headset,
  MailCheck,
  MessageSquareText,
  Phone,
  PhoneCall,
  Search,
  Send,
  Sparkles,
  User,
} from 'lucide-react';
import { AdminShell } from './AdminShell';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import { triggerStaffVoiceCallToPassenger } from '../../components/chat/StaffVoiceCallBanner';
import { toTelHref, toWhatsAppHref } from '../../services/voiceCallService';
import {
  sendChatMessage,
  subscribeChatMessages,
  subscribeStaffChatSessions,
  updateChatSessionMeta,
} from '../../services/chatService';
import type { ChatMessage, ChatSession, ChatSessionStatus } from '../../types/domain';

type FilterTab = 'all' | ChatSessionStatus;

function formatTime(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function StatusBadge({ status }: { status: ChatSessionStatus }) {
  const styles: Record<ChatSessionStatus, string> = {
    human_requested: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 border-red-200 dark:border-red-900',
    human_active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
    ai_active: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-900',
    resolved: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  };
  const labels: Record<ChatSessionStatus, string> = {
    human_requested: 'Needs Human',
    human_active: 'Human Active',
    ai_active: 'AI Active',
    resolved: 'Resolved',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wide ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export function AdminLiveChatPage() {
  const { profile } = useAuth();
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSessionParam = searchParams.get('session') || '';

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedId, setSelectedId] = useState<string>(initialSessionParam);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = subscribeStaffChatSessions(
      (list) => {
        setSessions(list);
        if (!selectedId && list.length > 0) {
          const priority = list.find((s) => s.status === 'human_requested') || list[0];
          setSelectedId(priority.id);
        }
      },
      (err) => {
        notify('Unable to load live chat sessions', 'error', err.message);
      }
    );
    return () => unsub();
  }, [notify]);

  useEffect(() => {
    if (initialSessionParam) {
      setSelectedId(initialSessionParam);
    }
  }, [initialSessionParam]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedId) || null,
    [sessions, selectedId]
  );

  useEffect(() => {
    if (!selectedSession) {
      setMessages([]);
      return;
    }
    const unsub = subscribeChatMessages(selectedSession.id, (msgs) => {
      setMessages(msgs);
    });
    if (selectedSession.unreadForStaff > 0) {
      updateChatSessionMeta(selectedSession.id, { unreadForStaff: 0 }).catch(() => {});
    }
    return () => unsub();
  }, [selectedSession?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const counts = useMemo(() => {
    return {
      all: sessions.length,
      human_requested: sessions.filter((s) => s.status === 'human_requested').length,
      human_active: sessions.filter((s) => s.status === 'human_active').length,
      ai_active: sessions.filter((s) => s.status === 'ai_active').length,
      resolved: sessions.filter((s) => s.status === 'resolved').length,
    };
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (filter !== 'all' && s.status !== filter) return false;
      if (!q) return true;
      return (
        s.visitorName.toLowerCase().includes(q) ||
        (s.visitorPhone || '').toLowerCase().includes(q) ||
        (s.visitorEmail || '').toLowerCase().includes(q) ||
        s.lastMessage.toLowerCase().includes(q)
      );
    });
  }, [sessions, filter, search]);

  const staffRole: 'admin' | 'counter_staff' =
    profile?.role === 'counter_staff' ? 'counter_staff' : 'admin';

  const handleSelectSession = (id: string) => {
    setSelectedId(id);
    setSearchParams({ session: id });
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession || !profile || !replyText.trim() || sending) return;
    setSending(true);
    const text = replyText.trim();
    setReplyText('');
    try {
      await sendChatMessage({
        session: selectedSession,
        senderRole: staffRole,
        senderName: profile.displayName || (staffRole === 'counter_staff' ? 'Counter Staff' : 'Admin'),
        senderUid: profile.uid,
        text,
        nextStatus: 'human_active',
        assignAgent: {
          uid: profile.uid,
          name: profile.displayName || 'Support Agent',
          role: staffRole,
        },
      });
    } catch (err) {
      notify('Failed to send reply', 'error', err instanceof Error ? err.message : undefined);
      setReplyText(text);
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (status: ChatSessionStatus) => {
    if (!selectedSession || !profile) return;
    await updateChatSessionMeta(selectedSession.id, {
      status,
      ...(status === 'human_active'
        ? {
            assignedAgentUid: profile.uid,
            assignedAgentName: profile.displayName || 'Support Agent',
            assignedAgentRole: staffRole,
          }
        : {}),
      ...(status === 'ai_active' ? { humanRequested: false } : {}),
    });
    notify(`Conversation marked as ${status.replace('_', ' ')}`, 'success');
  };

  return (
    <AdminShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-950 dark:text-white font-display flex items-center gap-2.5">
              <MessageSquareText className="w-6 h-6 text-orange-600" />
              Live Passenger Chat Desk
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Real-time AI &amp; human support inbox. Accessible exclusively to Admin and Bus Counter Staff.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ['all', `All (${counts.all})`],
                ['human_requested', `Needs Human (${counts.human_requested})`],
                ['human_active', `Active (${counts.human_active})`],
                ['ai_active', `AI Handled (${counts.ai_active})`],
                ['resolved', `Resolved (${counts.resolved})`],
              ] as Array<[FilterTab, string]>
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  filter === tab
                    ? 'bg-orange-600 text-white'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-14rem)] min-h-[540px]">
          {/* Left: Sessions List */}
          <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col overflow-hidden">
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search passenger, phone, message..."
                  className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSessions.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No chat conversations match this filter yet.
                </div>
              ) : (
                filteredSessions.map((s) => {
                  const isSelected = s.id === selectedSession?.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectSession(s.id)}
                      className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-orange-50/90 dark:bg-orange-950/30 border-l-4 border-l-orange-600'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-slate-950 dark:text-white truncate">
                          {s.visitorName}
                        </p>
                        {s.unreadForStaff > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-orange-600 text-white text-[10px] font-bold shrink-0">
                            {s.unreadForStaff}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <StatusBadge status={s.status} />
                        <span className="text-[10px] text-slate-400">{formatTime(s.updatedAt)}</span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                        {s.lastMessage}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Active Conversation */}
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col overflow-hidden">
            {!selectedSession ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
                <MessageSquareText className="w-10 h-10 text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Select a passenger conversation
                </p>
                <p className="text-xs mt-1 max-w-sm">
                  All AI and human chat transcripts are saved here automatically for Admin and Bus Counter Staff.
                </p>
              </div>
            ) : (
              <>
                {/* Conversation Header */}
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-950/40">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-7 h-7 rounded-lg bg-[#0B1F3A] text-white flex items-center justify-center text-xs font-bold">
                        <User className="w-3.5 h-3.5" />
                      </span>
                      <h2 className="text-base font-bold text-slate-950 dark:text-white truncate">
                        {selectedSession.visitorName}
                      </h2>
                      <StatusBadge status={selectedSession.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                      {selectedSession.visitorPhone && (
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Phone className="w-3 h-3" />
                          {selectedSession.visitorPhone}
                        </span>
                      )}
                      {selectedSession.visitorEmail && <span>{selectedSession.visitorEmail}</span>}
                      {selectedSession.emailNotificationStatus &&
                        selectedSession.emailNotificationStatus !== 'none' && (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <MailCheck className="w-3 h-3" />
                            Email Alert: {selectedSession.emailNotificationStatus}
                          </span>
                        )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedSession.userId && (
                      <button
                        type="button"
                        onClick={() =>
                          triggerStaffVoiceCallToPassenger({
                            targetUid: selectedSession.userId!,
                            passengerName: selectedSession.visitorName,
                            passengerPhone: selectedSession.visitorPhone,
                            passengerEmail: selectedSession.visitorEmail,
                            chatSessionId: selectedSession.id,
                          })
                        }
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                        Voice Call
                      </button>
                    )}
                    {selectedSession.visitorPhone && (
                      <>
                        <a
                          href={toWhatsAppHref(
                            selectedSession.visitorPhone,
                            `Hello ${selectedSession.visitorName}, DeshLine Support here.`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          WhatsApp
                        </a>
                        <a
                          href={toTelHref(selectedSession.visitorPhone)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          Dial
                        </a>
                      </>
                    )}
                    {selectedSession.status !== 'human_active' && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange('human_active')}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Headset className="w-3.5 h-3.5" />
                        Take Over Chat
                      </button>
                    )}
                    {selectedSession.status !== 'ai_active' && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange('ai_active')}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                        Return to AI
                      </button>
                    )}
                    {selectedSession.status !== 'resolved' && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange('resolved')}
                        className="px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Resolve
                      </button>
                    )}
                  </div>
                </div>

                {/* Message Thread */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50 dark:bg-slate-950/30">
                  {messages.map((m) => {
                    const isStaff = m.senderRole === 'admin' || m.senderRole === 'counter_staff';
                    const isAi = m.senderRole === 'ai';
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isStaff ? 'items-end' : 'items-start'}`}
                      >
                        <span className="text-[10px] font-semibold text-slate-400 mb-1 px-1 flex items-center gap-1">
                          {isAi && <Bot className="w-3 h-3 text-orange-500" />}
                          {isStaff && <Headset className="w-3 h-3 text-emerald-500" />}
                          {m.senderName}
                          {m.senderRole === 'counter_staff' && ' (Counter Staff)'}
                          {m.senderRole === 'admin' && ' (Admin)'}
                          {' · '}
                          {formatTime(m.createdAt)}
                        </span>
                        <div
                          className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                            isStaff
                              ? 'bg-[#0B1F3A] text-white rounded-br-sm'
                              : isAi
                                ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-slate-800 dark:text-amber-100 rounded-bl-sm'
                                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-bl-sm'
                          }`}
                        >
                          {m.text}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={endRef} />
                </div>

                {/* Staff Reply Box */}
                <form
                  onSubmit={handleSendReply}
                  className="p-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2.5 bg-white dark:bg-slate-900"
                >
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Reply as ${profile?.displayName || 'Support'} (${staffRole === 'counter_staff' ? 'Bus Counter' : 'Admin'})...`}
                    className="flex-1 h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                  <button
                    type="submit"
                    disabled={!replyText.trim() || sending}
                    className="px-4 h-10 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Send Reply
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
