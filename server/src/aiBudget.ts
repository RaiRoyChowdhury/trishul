// Global AI budget: ONE shared lifetime budget (default Rs 20 = 2000 paise) for every paid AI call, plus a 30-day live window.
// All amounts are integer PAISE. The decision to allow a call is made atomically in Postgres (reserve_ai_budget); this file holds
// the cost estimates, the status rules and a small wrapper: reserve first -> call the provider -> settle with the real cost.
import { HttpError, svc } from './lib.js';

// Public Sarvam prices (https://www.sarvam.ai/api-pricing), pay-as-you-go, in paise.
export const PRICE = {
  ttsPerChar: 0.3,          // Bulbul v3: Rs 30 per 10,000 characters
  clonedTtsPerChar: 0.2,    // voice cloning speech: Rs 20 per 10,000 characters
  sttPerSecond: 2940 / 3600, // Rs 29.40 per hour
  llmInPerToken: 0.0015,    // Sarvam 105B: Rs 15 per million input tokens
  llmOutPerToken: 0.006,    // Rs 60 per million output tokens
};
const SAFETY = 1.25;        // estimates are padded by 25%
const up = (n: number) => Math.max(1, Math.ceil(n));

export const estimateTts = (chars: number, cloned: boolean) => up(chars * (cloned ? PRICE.clonedTtsPerChar : PRICE.ttsPerChar) * SAFETY);
export const actualTts = (chars: number, cloned: boolean) => up(chars * (cloned ? PRICE.clonedTtsPerChar : PRICE.ttsPerChar));
export const estimateStt = (seconds: number) => up(seconds * PRICE.sttPerSecond * SAFETY);
export const actualStt = (seconds: number) => up(seconds * PRICE.sttPerSecond);
/** Bengali and Hindi use many tokens per character, so assume 1 token per character on the way in. */
export const estimateLlm = (inputChars: number, maxOutTokens: number) => up((inputChars * PRICE.llmInPerToken + maxOutTokens * PRICE.llmOutPerToken) * SAFETY);
export const actualLlm = (u: { prompt_tokens?: number; completion_tokens?: number } | undefined, fallbackEstimate: number) =>
  u && Number.isFinite(u.prompt_tokens) && Number.isFinite(u.completion_tokens) ? up((u.prompt_tokens! * PRICE.llmInPerToken) + (u.completion_tokens! * PRICE.llmOutPerToken)) : fallbackEstimate;

export interface AiConfigRow { budget_paise: number; spent_paise: number; reserved_paise: number; live_enabled: boolean; activated_at: string | null; expires_at: string | null }
export type AiReason = 'ok' | 'not_activated' | 'expired' | 'budget_exhausted' | 'no_key';
export interface AiStatus { mode: 'live' | 'demo'; reason: AiReason; remaining_paise: number; expires_at: string | null }

/** Live AI needs: admin activation, inside the 30-day window, budget left, and a provider key. Otherwise Scripted Demo Mode. */
export function computeStatus(c: AiConfigRow, now: number, hasKey: boolean): AiStatus {
  const remaining = Math.max(0, c.budget_paise - c.spent_paise - c.reserved_paise);
  const base = { remaining_paise: remaining, expires_at: c.expires_at };
  if (!c.live_enabled || !c.activated_at || !c.expires_at) return { mode: 'demo', reason: 'not_activated', ...base };
  if (now >= Date.parse(c.expires_at) || now < Date.parse(c.activated_at)) return { mode: 'demo', reason: 'expired', ...base };
  if (remaining < 1) return { mode: 'demo', reason: 'budget_exhausted', ...base };
  if (!hasKey) return { mode: 'demo', reason: 'no_key', ...base };
  return { mode: 'live', reason: 'ok', ...base };
}

export interface Meta { userId: string | null; provider: string; model: string; operation: string }
export interface BudgetStore {
  reserve(amount: number, m: Meta): Promise<string>;
  settle(id: string, actual: number, status: 'committed' | 'refunded' | 'failed', units: unknown, note: string): Promise<void>;
}
const unavailable = () => new HttpError(503, 'AI_UNAVAILABLE', 'Live AI is not available right now (not activated, expired, or budget used up). Scripted Demo Mode is used instead.');

export const supabaseStore: BudgetStore = {
  async reserve(amount, m) {
    const { data, error } = await svc().rpc('reserve_ai_budget', { p_amount: amount, p_user: m.userId, p_provider: m.provider, p_model: m.model, p_operation: m.operation });
    if (error) throw /AI_UNAVAILABLE/.test(error.message) ? unavailable() : new HttpError(503, 'AI_BUDGET_ERROR', 'The AI budget could not be checked, so no paid call was made.');
    return data as string;
  },
  async settle(id, actual, status, units, note) { await svc().rpc('settle_ai_usage', { p_id: id, p_actual: actual, p_status: status, p_units: units ?? null, p_note: note }); },
};

/** Reserve the estimate, run the provider call, then settle the real cost. A failed call releases the reservation and costs 0. */
export async function withBudget<T>(store: BudgetStore, meta: Meta, estimate: number, fn: () => Promise<{ result: T; actual: number; units?: unknown }>): Promise<T> {
  if (!Number.isFinite(estimate) || estimate <= 0) throw new HttpError(503, 'AI_BAD_ESTIMATE', 'The cost of this AI request could not be estimated safely, so it was not sent.');   // fail closed
  const id = await store.reserve(Math.ceil(estimate), meta);
  try {
    const out = await fn();
    await store.settle(id, out.actual, 'committed', out.units, out.actual > estimate ? 'actual exceeded estimate' : '').catch(() => undefined);
    return out.result;
  } catch (e) {
    await store.settle(id, 0, 'failed', null, e instanceof Error ? e.message.slice(0, 120) : 'error').catch(() => undefined);
    throw e;
  }
}

/** In-memory twin of the SQL functions, used by tests to check the rules (cap, expiry, release on failure). */
export function memoryStore(cfg: AiConfigRow, now: () => number): BudgetStore & { cfg: AiConfigRow; ledger: { id: string; est: number; actual?: number; status: string }[] } {
  const ledger: { id: string; est: number; actual?: number; status: string }[] = []; let n = 0;
  return {
    cfg, ledger,
    async reserve(amount) {
      const live = cfg.live_enabled && cfg.activated_at && cfg.expires_at && now() >= Date.parse(cfg.activated_at) && now() < Date.parse(cfg.expires_at);
      if (!live || cfg.spent_paise + cfg.reserved_paise + amount > cfg.budget_paise) throw unavailable();
      cfg.reserved_paise += amount; const id = `r${++n}`; ledger.push({ id, est: amount, status: 'reserved' }); return id;
    },
    async settle(id, actual, status) {
      const row = ledger.find(l => l.id === id && l.status === 'reserved'); if (!row) return;
      row.status = status; row.actual = actual; cfg.reserved_paise = Math.max(0, cfg.reserved_paise - row.est); if (status === 'committed') cfg.spent_paise += actual;
    },
  };
}

export async function loadConfig(): Promise<AiConfigRow> {
  const { data, error } = await svc().from('ai_config').select('budget_paise,spent_paise,reserved_paise,live_enabled,activated_at,expires_at').eq('id', 1).maybeSingle();
  if (error || !data) return { budget_paise: 0, spent_paise: 0, reserved_paise: 0, live_enabled: false, activated_at: null, expires_at: null };   // fail closed
  return data as AiConfigRow;
}
