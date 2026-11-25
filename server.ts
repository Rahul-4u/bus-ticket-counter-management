import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import firebaseConfig from './firebase-applet-config.json';
import {
  generateAiSupportReply,
  sendHumanSupportEmailNotification,
  type ChatHistoryTurn,
} from './api/_lib/chatBackend.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin ONLY for ID token verification (no IAM required)
const adminApp = getApps().length
  ? getApp()
  : initializeApp({ projectId: firebaseConfig.projectId });
const adminAuth = getAuth(adminApp);

// Ephemeral fallback signing key when payment webhook env secret is not configured in sandbox
const FALLBACK_SIGNING_SECRET = crypto.randomBytes(32).toString('hex');

function getPaymentSigningSecret(provider: string): string {
  if (provider === 'sslcommerz') {
    return process.env.SSLCOMMERZ_STORE_PASSWD || process.env.PAYMENT_WEBHOOK_SECRET || FALLBACK_SIGNING_SECRET;
  }
  if (provider === 'aamarpay') {
    return process.env.AAMARPAY_SIGNATURE_KEY || process.env.PAYMENT_WEBHOOK_SECRET || FALLBACK_SIGNING_SECRET;
  }
  return process.env.PAYMENT_WEBHOOK_SECRET || FALLBACK_SIGNING_SECRET;
}

interface AuthedRequest extends Request {
  authUser?: DecodedIdToken;
}

async function requireFirebaseAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization Bearer token' });
    return;
  }
  const idToken = header.slice('Bearer '.length).trim();
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    req.authUser = decoded;
    next();
  } catch (err) {
    console.error('Token verification failed:', err);
    res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
}

// Track processed idempotency keys in memory for duplicate callback protection
const processedPayments = new Map<string, {
  transactionId: string;
  bookingId: string;
  provider: string;
  amount: number;
  verifiedAt: string;
  signature: string;
}>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'DeshLine Paribahan API' });
  });

  app.post('/api/chat/ai', async (req: Request, res: Response) => {
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
    res.json(result);
  });

  app.post('/api/chat/notify-human', async (req: Request, res: Response) => {
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
    res.json(result);
  });

  /**
   * Create server-signed payment session for SSLCommerz or aamarPay sandbox.
   * Secrets remain exclusively on the server.
   */
  app.post('/api/payments/initiate', requireFirebaseAuth, (req: AuthedRequest, res: Response) => {
    const { bookingId, pnr, amount, provider, passengerName, passengerPhone, passengerEmail } = req.body ?? {};

    if (
      typeof bookingId !== 'string' || !bookingId ||
      typeof pnr !== 'string' || !pnr ||
      typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 ||
      !['sslcommerz', 'aamarpay', 'counter_cash'].includes(provider)
    ) {
      res.status(400).json({ error: 'Invalid payment initiation payload' });
      return;
    }

    const sessionKey = `SESS_${provider.toUpperCase()}_${crypto.randomBytes(8).toString('hex')}`;
    const transactionId = `TXN_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const secret = getPaymentSigningSecret(provider);
    const isSandbox = provider === 'sslcommerz'
      ? !process.env.SSLCOMMERZ_STORE_ID
      : provider === 'aamarpay'
        ? !process.env.AAMARPAY_STORE_ID
        : true;

    const canonical = `${bookingId}|${pnr}|${transactionId}|${amount}|${provider}|${req.authUser?.uid}`;
    const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

    res.json({
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
  });

  /**
   * Server-side payment verification & idempotency enforcement.
   * Never trusts client-only "success" flags without validating the HMAC session signature.
   */
  app.post('/api/payments/verify', requireFirebaseAuth, (req: AuthedRequest, res: Response) => {
    const { bookingId, pnr, transactionId, amount, provider, signature } = req.body ?? {};

    if (
      typeof bookingId !== 'string' || !bookingId ||
      typeof pnr !== 'string' || !pnr ||
      typeof transactionId !== 'string' || !transactionId ||
      typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 ||
      !['sslcommerz', 'aamarpay', 'counter_cash'].includes(provider) ||
      typeof signature !== 'string' || !signature
    ) {
      res.status(400).json({ error: 'Invalid payment verification payload' });
      return;
    }

    const existing = processedPayments.get(transactionId);
    if (existing) {
      res.json({
        verified: true,
        idempotentReplay: true,
        ...existing,
      });
      return;
    }

    const secret = getPaymentSigningSecret(provider);
    const canonical = `${bookingId}|${pnr}|${transactionId}|${amount}|${provider}|${req.authUser?.uid}`;
    const expectedSignature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSignature, 'utf8');
    const signatureValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

    if (!signatureValid) {
      res.status(403).json({ error: 'Payment signature verification failed' });
      return;
    }

    const record = {
      transactionId,
      bookingId,
      provider,
      amount,
      verifiedAt: new Date().toISOString(),
      signature: expectedSignature.slice(0, 16) + '...',
    };
    processedPayments.set(transactionId, record);

    res.json({
      verified: true,
      idempotentReplay: false,
      status: 'paid',
      ...record,
    });
  });

  /**
   * Payment gateway webhook callback endpoint (validates HMAC signature header).
   */
  app.post('/api/payments/webhook', (req: Request, res: Response) => {
    const sigHeader = req.headers['x-payment-signature'];
    const { transactionId, bookingId, provider, amount } = req.body ?? {};
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
    res.json({ received: true, transactionId });
  });

  if (process.env.NODE_ENV !== 'production') {
    app.get('/download-zip', (_req, res) => {
      const zipPath = path.join(__dirname, 'deshline-paribahan-vercel.zip');
      res.download(zipPath, 'deshline-paribahan-vercel.zip', (err) => {
        if (err && !res.headersSent) {
          res.status(404).json({ error: 'Zip archive not found' });
        }
      });
    });

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DeshLine Paribahan server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
