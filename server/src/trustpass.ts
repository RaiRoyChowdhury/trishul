// TrustPass: in-person verification between two people who agreed to walk together.
// Rules: the QR holds only a random one-time nonce (no names, no IDs); it expires in 2 minutes; scanning once uses it up;
// only the person who sent the request can scan it; BOTH people must then confirm; only then may location sharing start.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const QR_TTL_MS = 120_000;
export const CONFIRM_WINDOW_MS = 600_000;
export interface Challenge { id: string; issuer_id: string; scanner_id: string; nonce_hash: string; expires_at: string; scanned_at: string | null; issuer_confirmed: boolean; scanner_confirmed: boolean; status: 'issued' | 'scanned' | 'verified' | 'cancelled' }
export type TrustState = 'awaiting_scan' | 'qr_expired' | 'awaiting_confirm' | 'waiting_other' | 'verified' | 'cancelled';

export const makeNonce = () => randomBytes(32).toString('base64url');
export const hashNonce = (n: string) => createHash('sha256').update(n).digest('hex');
export const encodePayload = (id: string, nonce: string) => `TP1.${id}.${nonce}`;
export function parsePayload(s: unknown): { id: string; nonce: string } | null {
  const m = typeof s === 'string' ? /^TP1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/.exec(s.trim()) : null;
  return m ? { id: m[1], nonce: m[2] } : null;
}
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export type Check = { ok: true } | { ok: false; code: string; message: string };
const no = (code: string, message: string): Check => ({ ok: false, code, message });

export function checkScan(c: Challenge, scannerId: string, nonce: string, now: number): Check {
  if (c.scanner_id !== scannerId) return no('TRUSTPASS_NOT_YOURS', 'This TrustPass was not issued for you.');
  if (c.status !== 'issued') return no('TRUSTPASS_USED', 'This TrustPass has already been used. Ask for a new one.');   // replay protection
  if (now >= Date.parse(c.expires_at)) return no('TRUSTPASS_EXPIRED', 'This TrustPass has expired. Ask for a new one.');
  if (!same(hashNonce(nonce), c.nonce_hash)) return no('TRUSTPASS_INVALID', 'This TrustPass is not valid.');
  return { ok: true };
}
export function checkConfirm(c: Challenge, userId: string, now: number): Check {
  if (userId !== c.issuer_id && userId !== c.scanner_id) return no('TRUSTPASS_NOT_YOURS', 'This TrustPass is not yours.');
  if (c.status === 'verified') return { ok: true };
  if (c.status !== 'scanned' || !c.scanned_at) return no('TRUSTPASS_NOT_SCANNED', 'The QR must be scanned in person first.');
  if (now - Date.parse(c.scanned_at) > CONFIRM_WINDOW_MS) return no('TRUSTPASS_EXPIRED', 'The confirmation time ran out. Start again with a new TrustPass.');
  return { ok: true };
}
export function trustState(c: Challenge, userId: string, now: number): TrustState {
  if (c.status === 'cancelled') return 'cancelled';
  if (c.status === 'verified') return 'verified';
  if (c.status === 'issued') return now >= Date.parse(c.expires_at) ? 'qr_expired' : 'awaiting_scan';
  if (c.scanned_at && now - Date.parse(c.scanned_at) > CONFIRM_WINDOW_MS) return 'qr_expired';
  const mine = userId === c.issuer_id ? c.issuer_confirmed : c.scanner_confirmed;
  return mine ? 'waiting_other' : 'awaiting_confirm';
}
