import crypto from 'crypto';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
}

const adminApp = getApps().length
  ? getApp()
  : initializeApp({ projectId: firebaseConfig.projectId });
const adminAuth = getAuth(adminApp);

export function getPaymentSigningSecret(provider: string): string {
  if (provider === 'sslcommerz' && process.env.SSLCOMMERZ_STORE_PASSWD) {
    return process.env.SSLCOMMERZ_STORE_PASSWD;
  }
  if (provider === 'aamarpay' && process.env.AAMARPAY_SIGNATURE_KEY) {
    return process.env.AAMARPAY_SIGNATURE_KEY;
  }
  if (process.env.PAYMENT_WEBHOOK_SECRET) {
    return process.env.PAYMENT_WEBHOOK_SECRET;
  }
  // Consistent sandbox fallback across serverless invocations when env secrets are unset
  return crypto
    .createHash('sha256')
    .update(`deshline-sandbox:${firebaseConfig.projectId}:${firebaseConfig.firestoreDatabaseId}`)
    .digest('hex');
}

export async function verifyFirebaseToken(req: VercelRequest): Promise<DecodedIdToken | null> {
  const rawAuth = req.headers.authorization;
  const header = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  const idToken = header.slice('Bearer '.length).trim();
  if (!idToken) return null;
  try {
    return await adminAuth.verifyIdToken(idToken);
  } catch {
    return null;
  }
}
