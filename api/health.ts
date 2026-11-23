import type { VercelRequest, VercelResponse } from './_lib/paymentAuth';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ status: 'ok', service: 'DeshLine Paribahan API' });
}
