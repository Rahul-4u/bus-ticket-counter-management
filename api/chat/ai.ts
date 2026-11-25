import { generateAiSupportReply, type ChatHistoryTurn } from '../_lib/chatBackend.js';
import type { VercelRequest, VercelResponse } from '../_lib/paymentAuth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 4000) {
    res.status(400).json({ error: 'Message is required and must be under 4000 characters' });
    return;
  }

  const history = Array.isArray(body.history)
    ? (body.history.filter(
        (item): item is ChatHistoryTurn =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as ChatHistoryTurn).text === 'string' &&
          ['passenger', 'ai', 'admin', 'counter_staff'].includes((item as ChatHistoryTurn).senderRole)
      ) as ChatHistoryTurn[])
    : [];

  const result = await generateAiSupportReply({
    message,
    history,
    visitorName: typeof body.visitorName === 'string' ? body.visitorName.slice(0, 120) : undefined,
    routeSummary: typeof body.routeSummary === 'string' ? body.routeSummary.slice(0, 1500) : undefined,
  });

  res.status(200).json(result);
}
