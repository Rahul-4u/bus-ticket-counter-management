import crypto from 'crypto';
import {
  getPaymentSigningSecret,
  type VercelRequest,
  type VercelResponse,
} from '../_lib/paymentAuth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rawSig = req.headers['x-payment-signature'];
  const sigHeader = Array.isArray(rawSig) ? rawSig[0] : rawSig;
  const body = (req.body || {}) as Record<string, unknown>;
  const { transactionId, bookingId, provider, amount } = body;

  if (typeof sigHeader !== 'string' || !transactionId || !bookingId || !provider) {
    res.status(400).json({ error: 'Invalid webhook payload or missing signature' });
    return;
  }

  const secret = getPaymentSigningSecret(String(provider));
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${bookingId}|${transactionId}|${amount}`)
    .digest('hex');

  const a = Buffer.from(sigHeader, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  res.status(200).json({ received: true, transactionId });
}
