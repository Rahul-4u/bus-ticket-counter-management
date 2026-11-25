import { sendHumanSupportEmailNotification } from '../_lib/chatBackend';
import type { VercelRequest, VercelResponse } from '../_lib/paymentAuth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const visitorName = typeof body.visitorName === 'string' ? body.visitorName.trim() : 'Passenger Guest';
  const lastMessage = typeof body.lastMessage === 'string' ? body.lastMessage.trim() : '';

  if (!sessionId || !lastMessage) {
    res.status(400).json({ error: 'sessionId and lastMessage are required' });
    return;
  }

  const transcript = Array.isArray(body.transcript)
    ? body.transcript.filter(
        (t): t is { senderRole: string; senderName: string; text: string } =>
          Boolean(t) &&
          typeof t === 'object' &&
          typeof (t as { text?: unknown }).text === 'string'
      )
    : [];

  const result = await sendHumanSupportEmailNotification({
    sessionId,
    visitorName: visitorName.slice(0, 120),
    visitorEmail: typeof body.visitorEmail === 'string' ? body.visitorEmail.slice(0, 200) : undefined,
    visitorPhone: typeof body.visitorPhone === 'string' ? body.visitorPhone.slice(0, 32) : undefined,
    lastMessage: lastMessage.slice(0, 2000),
    transcript,
  });

  res.status(200).json(result);
}
