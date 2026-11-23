import crypto from 'crypto';
import {
  getPaymentSigningSecret,
  verifyFirebaseToken,
  type VercelRequest,
  type VercelResponse,
} from '../_lib/paymentAuth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authUser = await verifyFirebaseToken(req);
  if (!authUser) {
    res.status(401).json({ error: 'Missing or invalid Authorization Bearer token' });
    return;
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const { bookingId, pnr, transactionId, amount, provider, signature } = body;

  if (
    typeof bookingId !== 'string' || !bookingId ||
    typeof pnr !== 'string' || !pnr ||
    typeof transactionId !== 'string' || !transactionId ||
    typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 ||
    typeof provider !== 'string' || !['sslcommerz', 'aamarpay', 'counter_cash'].includes(provider) ||
    typeof signature !== 'string' || !signature
  ) {
    res.status(400).json({ error: 'Invalid payment verification payload' });
    return;
  }

  const secret = getPaymentSigningSecret(provider);
  const canonical = `${bookingId}|${pnr}|${transactionId}|${amount}|${provider}|${authUser.uid}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedSignature, 'utf8');
  const signatureValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

  if (!signatureValid) {
    res.status(403).json({ error: 'Payment signature verification failed' });
    return;
  }

  res.status(200).json({
    verified: true,
    idempotentReplay: false,
    status: 'paid',
    transactionId,
    bookingId,
    provider,
    amount,
    verifiedAt: new Date().toISOString(),
    signature: expectedSignature.slice(0, 16) + '...',
  });
}
