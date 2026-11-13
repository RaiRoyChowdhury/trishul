import { describe, expect, it } from 'vitest';
import { actualLlm, actualTts, computeStatus, estimateLlm, estimateStt, estimateTts, memoryStore, withBudget, type AiConfigRow } from './aiBudget.js';

const T0 = Date.parse('2026-12-01T00:00:00Z'); const DAY = 86400000;
const cfg = (o: Partial<AiConfigRow> = {}): AiConfigRow => ({ budget_paise: 2000, spent_paise: 0, reserved_paise: 0, live_enabled: true, activated_at: new Date(T0).toISOString(), expires_at: new Date(T0 + 30 * DAY).toISOString(), ...o });
const meta = { userId: 'u', provider: 'sarvam', model: 'm', operation: 'tts' };

describe('status rules', () => {
  it('not activated -> demo', () => expect(computeStatus(cfg({ live_enabled: false }), T0, true).reason).toBe('not_activated'));
  it('live inside the window with key and budget', () => expect(computeStatus(cfg(), T0 + DAY, true)).toMatchObject({ mode: 'live', reason: 'ok', remaining_paise: 2000 }));
  it('expires after 30 days -> demo', () => expect(computeStatus(cfg(), T0 + 30 * DAY, true)).toMatchObject({ mode: 'demo', reason: 'expired' }));
  it('budget used up -> demo', () => expect(computeStatus(cfg({ spent_paise: 2000 }), T0 + DAY, true)).toMatchObject({ mode: 'demo', reason: 'budget_exhausted' }));
  it('reserved money counts as used', () => expect(computeStatus(cfg({ spent_paise: 1500, reserved_paise: 500 }), T0 + DAY, true).reason).toBe('budget_exhausted'));
  it('no provider key -> demo', () => expect(computeStatus(cfg(), T0 + DAY, false).reason).toBe('no_key'));
});
describe('cost estimates (paise)', () => {
  it('TTS is 0.3 paise per character, padded 25% for the estimate', () => { expect(actualTts(100, false)).toBe(30); expect(estimateTts(100, false)).toBe(38); expect(estimateTts(100, false)).toBeGreaterThanOrEqual(actualTts(100, false)); });
  it('estimates are never zero (fail-safe minimum 1 paisa)', () => { expect(estimateTts(1, false)).toBe(1); expect(estimateStt(0.01)).toBe(1); });
  it('STT about 0.82 paise per second', () => expect(estimateStt(10)).toBeGreaterThanOrEqual(actualTts(0, false) + 10));
  it('LLM uses real usage when reported, else the estimate', () => {
    const e = estimateLlm(1200, 200); expect(actualLlm({ prompt_tokens: 500, completion_tokens: 100 }, e)).toBeLessThanOrEqual(e);
    expect(actualLlm(undefined, e)).toBe(e);
  });
});
describe('budget wrapper', () => {
  const ok = (actual: number) => async () => ({ result: 'done', actual });
  it('commits the real cost and releases the reservation', async () => {
    const s = memoryStore(cfg(), () => T0 + DAY); await withBudget(s, meta, 50, ok(30));
    expect(s.cfg).toMatchObject({ spent_paise: 30, reserved_paise: 0 });
  });
  it('a failed provider call costs nothing', async () => {
    const s = memoryStore(cfg(), () => T0 + DAY);
    await expect(withBudget(s, meta, 50, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(s.cfg).toMatchObject({ spent_paise: 0, reserved_paise: 0 }); expect(s.ledger[0].status).toBe('failed');
  });
  it('rejects a request that could exceed the budget, and never calls the provider', async () => {
    const s = memoryStore(cfg({ spent_paise: 1980 }), () => T0 + DAY); let called = false;
    await expect(withBudget(s, meta, 50, async () => { called = true; return { result: 1, actual: 1 }; })).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(called).toBe(false);
  });
  it('simultaneous requests cannot overspend: reservations count immediately', async () => {
    const s = memoryStore(cfg({ budget_paise: 100 }), () => T0 + DAY);
    const slow = () => new Promise<{ result: number; actual: number }>(r => setTimeout(() => r({ result: 1, actual: 40 }), 20));
    const res = await Promise.allSettled([1, 2, 3].map(() => withBudget(s, meta, 40, slow)));
    expect(res.filter(r => r.status === 'fulfilled')).toHaveLength(2); expect(s.cfg.spent_paise).toBeLessThanOrEqual(100);
  });
  it('refuses after expiry and before activation', async () => {
    await expect(withBudget(memoryStore(cfg(), () => T0 + 31 * DAY), meta, 5, ok(5))).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    await expect(withBudget(memoryStore(cfg({ live_enabled: false }), () => T0), meta, 5, ok(5))).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });
  it('fails closed on a bad estimate', async () => {
    const s = memoryStore(cfg(), () => T0 + DAY);
    await expect(withBudget(s, meta, NaN, ok(1))).rejects.toMatchObject({ code: 'AI_BAD_ESTIMATE' });
    await expect(withBudget(s, meta, 0, ok(1))).rejects.toMatchObject({ code: 'AI_BAD_ESTIMATE' });
  });
});

import { cleanReply, wavSeconds } from './routes/call.js';
describe('call helpers', () => {
  it('strips hidden reasoning before speaking', () => expect(cleanReply('<think>plan</think>\nহ্যালো মা')).toBe('হ্যালো মা'));
  it('reads WAV length from the header', () => {
    const b = Buffer.alloc(44 + 48000); b.writeUInt32LE(24000, 24); b.writeUInt16LE(16, 34); b.writeUInt16LE(1, 22);
    expect(wavSeconds(b)).toBeCloseTo(1, 2);
  });
});
