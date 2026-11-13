import { describe, expect, it } from 'vitest';
import { checkConfirm, checkScan, encodePayload, hashNonce, makeNonce, parsePayload, trustState, type Challenge } from './trustpass.js';

const T = Date.parse('2026-12-01T10:00:00Z'); const ID = '123e4567-e89b-12d3-a456-426614174000';
const mk = (o: Partial<Challenge> = {}, nonce = 'n'): Challenge => ({ id: ID, issuer_id: 'host', scanner_id: 'guest', nonce_hash: hashNonce(nonce), expires_at: new Date(T + 120000).toISOString(), scanned_at: null, issuer_confirmed: false, scanner_confirmed: false, status: 'issued', ...o });

describe('TrustPass QR', () => {
  it('nonces are random and the payload carries no personal data', () => {
    const a = makeNonce(), b = makeNonce(); expect(a).not.toBe(b); expect(a).toHaveLength(43);
    const p = encodePayload(ID, a); expect(p).toMatch(/^TP1\./); expect(parsePayload(p)).toEqual({ id: ID, nonce: a });
  });
  it('rejects malformed payloads', () => { for (const s of ['', 'hello', 'TP1.x.y', `TP1.${ID}.short`, 42, null]) expect(parsePayload(s as string)).toBeNull(); });
  it('valid scan by the right person inside 2 minutes', () => { const n = makeNonce(); expect(checkScan(mk({ nonce_hash: hashNonce(n) }), 'guest', n, T + 1000)).toEqual({ ok: true }); });
  it('wrong person cannot scan', () => expect(checkScan(mk(), 'stranger', 'n', T)).toMatchObject({ ok: false, code: 'TRUSTPASS_NOT_YOURS' }));
  it('expired QR is rejected', () => expect(checkScan(mk(), 'guest', 'n', T + 120001)).toMatchObject({ code: 'TRUSTPASS_EXPIRED' }));
  it('one-time: a second scan is a replay', () => expect(checkScan(mk({ status: 'scanned' }), 'guest', 'n', T)).toMatchObject({ code: 'TRUSTPASS_USED' }));
  it('wrong nonce is invalid', () => expect(checkScan(mk(), 'guest', 'other', T)).toMatchObject({ code: 'TRUSTPASS_INVALID' }));
});
describe('confirmation', () => {
  const scanned = mk({ status: 'scanned', scanned_at: new Date(T).toISOString() });
  it('scanning alone is not trust: confirmation needs a scanned QR', () => expect(checkConfirm(mk(), 'host', T)).toMatchObject({ ok: false, code: 'TRUSTPASS_NOT_SCANNED' }));
  it('only the two people can confirm', () => { expect(checkConfirm(scanned, 'host', T + 1000)).toEqual({ ok: true }); expect(checkConfirm(scanned, 'x', T + 1000)).toMatchObject({ ok: false }); });
  it('confirmation window is 10 minutes', () => expect(checkConfirm(scanned, 'host', T + 600001)).toMatchObject({ code: 'TRUSTPASS_EXPIRED' }));
});
describe('states shown to people', () => {
  it('walks through every state', () => {
    expect(trustState(mk(), 'host', T)).toBe('awaiting_scan'); expect(trustState(mk(), 'host', T + 130000)).toBe('qr_expired');
    const s = mk({ status: 'scanned', scanned_at: new Date(T).toISOString() });
    expect(trustState(s, 'host', T + 1000)).toBe('awaiting_confirm');
    expect(trustState({ ...s, issuer_confirmed: true }, 'host', T + 1000)).toBe('waiting_other'); expect(trustState({ ...s, issuer_confirmed: true }, 'guest', T + 1000)).toBe('awaiting_confirm');
    expect(trustState({ ...s, status: 'verified' }, 'guest', T)).toBe('verified');
  });
});
