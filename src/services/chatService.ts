import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  AppNotification,
  ChatMessage,
  ChatSenderRole,
  ChatSession,
  ChatSessionStatus,
} from '../types/domain';

const CHAT_STORAGE_PREFIX = 'deshline_live_chat_v1_';

function randomToken(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}_${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${uuid}`.slice(0, 64);
}

export interface StoredChatIdentity {
  sessionId: string;
  visitorToken: string;
}

export function getOrCreateLocalChatIdentity(userId?: string | null): StoredChatIdentity {
  const key = `${CHAT_STORAGE_PREFIX}${userId || 'guest'}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredChatIdentity>;
      if (parsed.sessionId && parsed.visitorToken && parsed.visitorToken.length >= 16) {
        return { sessionId: parsed.sessionId, visitorToken: parsed.visitorToken };
      }
    }
  } catch {
    // Ignore malformed localStorage
  }
  const fresh: StoredChatIdentity = {
    sessionId: randomToken('chat'),
    visitorToken: randomToken('tok'),
  };
  try {
    localStorage.setItem(key, JSON.stringify(fresh));
  } catch {
    // Ignore storage quota errors
  }
  return fresh;
}

export function resetLocalChatIdentity(userId?: string | null): StoredChatIdentity {
  const key = `${CHAT_STORAGE_PREFIX}${userId || 'guest'}`;
  const fresh: StoredChatIdentity = {
    sessionId: randomToken('chat'),
    visitorToken: randomToken('tok'),
  };
  try {
    localStorage.setItem(key, JSON.stringify(fresh));
  } catch {
    // Ignore storage quota errors
  }
  return fresh;
}

export async function findLatestUserChatSession(uid: string): Promise<ChatSession | null> {
  try {
    const q = query(collection(db, 'chat_sessions'), where('userId', '==', uid));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const list = snap.docs.map((d) => d.data() as ChatSession);
    list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return list[0] || null;
  } catch {
    return null;
  }
}

export async function ensureChatSession(params: {
  sessionId: string;
  visitorToken: string;
  userId?: string | null;
  visitorName: string;
  visitorEmail?: string;
  visitorPhone?: string;
}): Promise<ChatSession> {
  const ref = doc(db, 'chat_sessions', params.sessionId);
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      return existing.data() as ChatSession;
    }

    const now = new Date().toISOString();
    const welcomeText =
      'আসসালামু আলাইকুম! আমি DeshLine AI Assistant। বাসের টিকেট বুকিং, সিট নির্বাচন, ভাড়া, PNR ট্র্যাকিং, পেমেন্ট বা রিফান্ড সংক্রান্ত যেকোনো প্রশ্ন করতে পারেন। সরাসরি মানুষের (Admin / Counter Staff) সাথে কথা বলতে চাইলে "মানুষের সাহায্য লাগবে" বা নিচের "Talk to Human" বাটনে ক্লিক করুন।';

    const session: ChatSession = {
      id: params.sessionId,
      visitorToken: params.visitorToken,
      userId: params.userId ?? null,
      visitorName: params.visitorName.trim().slice(0, 120) || 'Passenger Guest',
      ...(params.visitorEmail ? { visitorEmail: params.visitorEmail.trim().slice(0, 200) } : {}),
      ...(params.visitorPhone ? { visitorPhone: params.visitorPhone.trim().slice(0, 32) } : {}),
      status: 'ai_active',
      humanRequested: false,
      assignedAgentUid: null,
      assignedAgentName: null,
      assignedAgentRole: null,
      lastMessage: welcomeText.slice(0, 200),
      lastSenderRole: 'ai',
      unreadForStaff: 0,
      unreadForPassenger: 0,
      emailNotificationStatus: 'none',
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(ref, session);

    const msgId = randomToken('msg');
    const welcomeMessage: ChatMessage = {
      id: msgId,
      sessionId: params.sessionId,
      senderRole: 'ai',
      senderName: 'DeshLine AI Assistant',
      senderUid: null,
      text: welcomeText,
      createdAt: now,
    };
    await setDoc(doc(db, 'chat_sessions', params.sessionId, 'messages', msgId), welcomeMessage);

    return session;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chat_sessions/${params.sessionId}`);
  }
}

export function subscribeChatSession(
  sessionId: string,
  onUpdate: (session: ChatSession | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'chat_sessions', sessionId),
    (snap) => {
      onUpdate(snap.exists() ? (snap.data() as ChatSession) : null);
    },
    (err) => {
      console.error('Chat session listener error:', err);
    }
  );
}

export function subscribeChatMessages(
  sessionId: string,
  onUpdate: (messages: ChatMessage[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'chat_sessions', sessionId, 'messages'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(snap.docs.map((d) => d.data() as ChatMessage));
    },
    (err) => {
      console.error('Chat messages listener error:', err);
    }
  );
}

export function subscribeStaffChatSessions(
  onUpdate: (sessions: ChatSession[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'chat_sessions'), orderBy('updatedAt', 'desc'), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(snap.docs.map((d) => d.data() as ChatSession));
    },
    (err) => {
      console.error('Staff chat sessions listener error:', err);
      onError?.(err);
    }
  );
}

export async function sendChatMessage(params: {
  session: ChatSession;
  senderRole: ChatSenderRole;
  senderName: string;
  senderUid?: string | null;
  text: string;
  nextStatus?: ChatSessionStatus;
  humanRequested?: boolean;
  assignAgent?: {
    uid: string;
    name: string;
    role: 'admin' | 'counter_staff';
  };
  visitorDetails?: {
    visitorName?: string;
    visitorEmail?: string;
    visitorPhone?: string;
  };
}): Promise<ChatMessage> {
  const now = new Date().toISOString();
  const cleanText = params.text.trim().slice(0, 4000);
  const msgId = randomToken('msg');

  const message: ChatMessage = {
    id: msgId,
    sessionId: params.session.id,
    senderRole: params.senderRole,
    senderName: params.senderName.trim().slice(0, 120) || 'User',
    senderUid: params.senderUid ?? null,
    text: cleanText,
    createdAt: now,
  };

  try {
    await setDoc(doc(db, 'chat_sessions', params.session.id, 'messages', msgId), message);

    const isFromPassenger = params.senderRole === 'passenger';
    const isFromStaff = params.senderRole === 'admin' || params.senderRole === 'counter_staff';

    const sessionUpdates: Record<string, unknown> = {
      lastMessage: cleanText.slice(0, 300),
      lastSenderRole: params.senderRole,
      updatedAt: now,
      unreadForStaff: isFromPassenger
        ? (params.session.unreadForStaff || 0) + 1
        : isFromStaff
          ? 0
          : params.session.unreadForStaff || 0,
      unreadForPassenger: isFromStaff
        ? (params.session.unreadForPassenger || 0) + 1
        : isFromPassenger
          ? 0
          : params.session.unreadForPassenger || 0,
    };

    if (params.nextStatus) {
      sessionUpdates.status = params.nextStatus;
    }
    if (typeof params.humanRequested === 'boolean') {
      sessionUpdates.humanRequested = params.humanRequested;
      if (params.humanRequested && !params.session.humanRequestedAt) {
        sessionUpdates.humanRequestedAt = now;
      }
    }
    if (params.assignAgent) {
      sessionUpdates.assignedAgentUid = params.assignAgent.uid;
      sessionUpdates.assignedAgentName = params.assignAgent.name;
      sessionUpdates.assignedAgentRole = params.assignAgent.role;
    }
    if (params.visitorDetails?.visitorName) {
      sessionUpdates.visitorName = params.visitorDetails.visitorName.trim().slice(0, 120);
    }
    if (params.visitorDetails?.visitorEmail) {
      sessionUpdates.visitorEmail = params.visitorDetails.visitorEmail.trim().slice(0, 200);
    }
    if (params.visitorDetails?.visitorPhone) {
      sessionUpdates.visitorPhone = params.visitorDetails.visitorPhone.trim().slice(0, 32);
    }

    await updateDoc(doc(db, 'chat_sessions', params.session.id), sessionUpdates);
    return message;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chat_sessions/${params.session.id}/messages/${msgId}`);
  }
}

export async function updateChatSessionMeta(
  sessionId: string,
  updates: Partial<
    Pick<
      ChatSession,
      | 'status'
      | 'humanRequested'
      | 'humanRequestedAt'
      | 'assignedAgentUid'
      | 'assignedAgentName'
      | 'assignedAgentRole'
      | 'unreadForStaff'
      | 'unreadForPassenger'
      | 'emailNotificationStatus'
      | 'emailNotificationNote'
      | 'visitorName'
      | 'visitorEmail'
      | 'visitorPhone'
    >
  >
): Promise<void> {
  try {
    await updateDoc(doc(db, 'chat_sessions', sessionId), {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chat_sessions/${sessionId}`);
  }
}

export async function createStaffChatAlertNotification(params: {
  sessionId: string;
  visitorName: string;
  message: string;
}): Promise<void> {
  const id = randomToken('notif');
  const notification: AppNotification = {
    id,
    targetUid: 'staff_broadcast',
    targetRole: 'counter_staff',
    title: `Live Support Request: ${params.visitorName}`,
    message: params.message.slice(0, 220),
    type: 'system',
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  try {
    await setDoc(doc(db, 'notifications', id), notification);
  } catch {
    // Non-fatal if notification broadcast write fails
  }
}

export interface AiChatResponse {
  reply: string;
  escalateToHuman: boolean;
  provider: 'gemini' | 'fallback';
}

export async function requestAiChatReply(payload: {
  message: string;
  history: Array<{ senderRole: ChatSenderRole; text: string }>;
  visitorName?: string;
  routeSummary?: string;
}): Promise<AiChatResponse> {
  const res = await fetch('/api/chat/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error('AI assistant request failed');
  }
  return (await res.json()) as AiChatResponse;
}

export interface HumanNotifyResponse {
  notified: boolean;
  channel: 'smtp' | 'resend' | 'console_log';
  recipient: string;
  note: string;
}

export async function triggerHumanSupportEmail(payload: {
  sessionId: string;
  visitorName: string;
  visitorEmail?: string;
  visitorPhone?: string;
  lastMessage: string;
  transcript?: Array<{ senderRole: ChatSenderRole; senderName: string; text: string }>;
}): Promise<HumanNotifyResponse> {
  const res = await fetch('/api/chat/notify-human', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error('Failed to send human support notification');
  }
  return (await res.json()) as HumanNotifyResponse;
}
