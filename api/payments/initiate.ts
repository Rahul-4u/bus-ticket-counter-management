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
  const { bookingId, pnr, amount, provider, passengerName, passengerPhone, passengerEmail } = body;

  if (
    typeof bookingId !== 'string' || !bookingId ||
    typeof pnr !== 'string' || !pnr ||
    typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 ||
    typeof provider !== 'string' || !['sslcommerz', 'aamarpay', 'counter_cash'].includes(provider)
  ) {
    res.status(400).json({ error: 'Invalid payment initiation payload' });
    return;
  }

  const sessionKey = `SESS_${provider.toUpperCase()}_${crypto.randomBytes(8).toString('hex')}`;
  const transactionId = `TXN_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const secret = getPaymentSigningSecret(provider);
  const isSandbox =
    provider === 'sslcommerz'
      ? !process.env.SSLCOMMERZ_STORE_ID
      : provider === 'aamarpay'
        ? !process.env.AAMARPAY_STORE_ID
        : true;

  const canonical = `${bookingId}|${pnr}|${transactionId}|${amount}|${provider}|${authUser.uid}`;
  const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

  res.status(200).json({
    sessionKey,
    transactionId,
    provider,
    amount,
    currency: 'BDT',
    mode: isSandbox ? 'sandbox' : 'live',
    signature,
    customerSummary: {
      name: typeof passengerName === 'string' ? passengerName.slice(0, 120) : 'Passenger',
      phone: typeof passengerPhone === 'string' ? passengerPhone.slice(0, 32) : '',
      email: typeof passengerEmail === 'string' ? passengerEmail.slice(0, 200) : '',
    },
    createdAt: new Date().toISOString(),
  });
}
