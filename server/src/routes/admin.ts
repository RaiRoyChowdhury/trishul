import { DEMO_VOLUNTEER_SEED } from '../demoSeed.js';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { env, serviceStatus } from '../config.js';
import { ah, dbCheck, HttpError, limiter, parse, requireAuth, svc, type AuthedRequest } from '../lib.js';
import { actualTts, computeStatus, estimateTts, loadConfig, supabaseStore, withBudget } from '../aiBudget.js';
import { sarvamBody, decodeSarvam } from './call.js';

// Admin Control Centre API. Every route needs a signed-in user whose profile role is 'admin' (set only in the database).
const r = Router();
r.use(requireAuth);
const A = (req: unknown) => req as AuthedRequest;
const requireAdmin: RequestHandler = async (req, _res, next) => {
  try {
    const p = dbCheck(await svc().from('profiles').select('role').eq('id', A(req).userId).maybeSingle()) as { role?: string } | null;
    if (p?.role !== 'admin') throw new HttpError(403, 'NOT_ADMIN', 'Administrator access only.');
    next();
  } catch (e) { next(e); }
};
r.use('/admin', requireAdmin, limiter(60_000, 120));
const audit = async (req: unknown, action: string, detail: unknown = null) => { await svc().from('admin_audit').insert({ admin_id: A(req).userId, action, detail }); };
const DAY = 86400000;

r.get('/admin/overview', ah(async (_req, res) => {
  const cfg = await loadConfig(); const st = computeStatus(cfg, Date.now(), !!env.sarvamKey);
  const count = async (t: string) => (await svc().from(t).select('id', { count: 'exact', head: true })).count ?? 0;
  const ledger = dbCheck(await svc().from('ai_usage_ledger').select('id,created_at,provider,model,operation,status,estimated_paise,actual_paise,note').order('created_at', { ascending: false }).limit(30));
  const log = dbCheck(await svc().from('admin_audit').select('action,detail,created_at').order('created_at', { ascending: false }).limit(15));
  res.json({
    ai: { status: st, config: cfg, models: { chat: env.sarvamChatModel, stt: env.sarvamSttModel, tts: env.sarvamModel } },
    services: serviceStatus(), settings: { sample_reports: env.sampleReports, auto_approve_photos: env.autoApprovePhotos, require_verified_walk: env.requireVerifiedWalk, danger_min_people: env.dangerMinPeople },
    counts: { users: await count('profiles'), reports: await count('safety_reports'), sos_events: await count('sos_events') }, ledger, audit: log,
  });
}));

// Start the 30-day live period. Does NOT reset spending: the Rs 20 budget is shared for the whole life of the app.
r.post('/admin/ai/activate', ah(async (req, res) => {
  const cfg = await loadConfig(); const now = Date.now();
  if (cfg.live_enabled && cfg.expires_at && now < Date.parse(cfg.expires_at)) throw new HttpError(409, 'ALREADY_ACTIVE', 'Live AI is already active.');
  if (!env.sarvamKey) throw new HttpError(409, 'NO_KEY', 'Add SARVAM_API_KEY to the server .env file first.');
  const at = new Date(now), exp = new Date(now + 30 * DAY);
  dbCheck(await svc().from('ai_config').update({ live_enabled: true, activated_at: at.toISOString(), expires_at: exp.toISOString(), updated_at: at.toISOString() }).eq('id', 1));
  await audit(req, 'ai.activate', { expires_at: exp.toISOString() }); res.json({ activated_at: at.toISOString(), expires_at: exp.toISOString() });
}));
r.post('/admin/ai/deactivate', ah(async (req, res) => {
  dbCheck(await svc().from('ai_config').update({ live_enabled: false, updated_at: new Date().toISOString() }).eq('id', 1)); await audit(req, 'ai.deactivate'); res.json({ ok: true });
}));
r.put('/admin/ai/budget', ah(async (req, res) => {
  const b = parse(z.object({ budget_inr: z.number().min(0).max(1000) }).strict(), req.body); const cfg = await loadConfig(); const paise = Math.round(b.budget_inr * 100);
  if (paise < cfg.spent_paise + cfg.reserved_paise) throw new HttpError(400, 'BELOW_SPENT', 'The budget cannot be lower than what is already used.');
  dbCheck(await svc().from('ai_config').update({ budget_paise: paise, updated_at: new Date().toISOString() }).eq('id', 1)); await audit(req, 'ai.budget', { paise }); res.json({ budget_paise: paise });
}));
// Connection test: one tiny, budgeted text-to-speech request (about 1 paisa). Needs live AI to be active.
r.post('/admin/sarvam/test', limiter(60_000, 5), ah(async (req, res) => {
  if (!env.sarvamKey) throw new HttpError(409, 'NO_KEY', 'SARVAM_API_KEY is not set.');
  const text = 'ठीक है';
  const ok = await withBudget(supabaseStore, { userId: A(req).userId, provider: 'sarvam', model: env.sarvamModel, operation: 'admin-test' }, estimateTts(text.length, false), async () => {
    const rsp = await fetch('https://api.sarvam.ai/text-to-speech', { method: 'POST', headers: { 'api-subscription-key': env.sarvamKey, 'content-type': 'application/json' }, body: JSON.stringify(sarvamBody(text, 'hi', env.sarvamSpeaker, env.sarvamModel)), signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!rsp || !rsp.ok) throw new HttpError(502, 'TEST_FAILED', rsp ? `Sarvam returned ${rsp.status}.` : 'Could not reach Sarvam.');
    return { result: !!decodeSarvam(await rsp.json().catch(() => null)), actual: actualTts(text.length, false) };
  });
  await audit(req, 'sarvam.test', { ok }); res.json({ ok });
}));
// Telegram check: getMe is free and does not message anyone.
r.post('/admin/telegram/test', ah(async (req, res) => {
  if (!env.telegramToken) throw new HttpError(409, 'NO_TOKEN', 'TELEGRAM_BOT_TOKEN is not set.');
  const rsp = await fetch(`https://api.telegram.org/bot${env.telegramToken}/getMe`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
  const j: any = rsp ? await rsp.json().catch(() => null) : null;
  await audit(req, 'telegram.test', { ok: !!j?.ok });
  if (!j?.ok) throw new HttpError(502, 'TEST_FAILED', 'Telegram did not accept the bot token.');
  res.json({ ok: true, bot: `@${j.result.username}` });
}));

r.get('/admin/reports', ah(async (_req, res) => {
  res.json(dbCheck(await svc().from('safety_reports').select('id,category,description,area_label,status,flag_count,corroboration_count,occurred_at').order('created_at', { ascending: false }).limit(50)));
}));
r.post('/admin/reports/:id/:action(hide|unhide)', ah(async (req, res) => {
  const hide = req.params.action === 'hide'; dbCheck(await svc().from('safety_reports').update({ status: hide ? 'hidden' : 'active' }).eq('id', req.params.id));
  await audit(req, `report.${req.params.action}`, { id: req.params.id }); res.json({ ok: true });
}));
r.get('/admin/users', ah(async (_req, res) => {
  res.json(dbCheck(await svc().from('profiles').select('id,display_name,age_group,role,verification_status,photo_status,created_at').order('created_at', { ascending: false }).limit(50)));
}));
r.post('/admin/users/:id/photo', ah(async (req, res) => {
  const b = parse(z.object({ status: z.enum(['approved', 'rejected']) }).strict(), req.body);
  dbCheck(await svc().from('profiles').update({ photo_status: b.status }).eq('id', req.params.id)); await audit(req, 'photo.review', { id: req.params.id, status: b.status }); res.json({ ok: true });
}));

// Resets ONLY fictional demo data (is_demo volunteers and requests to them). Real users and reports are never touched.
r.post('/admin/demo/reset', ah(async (req, res) => {
  const old = dbCheck(await svc().from('shakti_volunteers').select('id').eq('is_demo', true)) as { id: string }[];
  if (old.length) dbCheck(await svc().from('shakti_volunteers').delete().in('id', old.map(x => x.id)));
  dbCheck(await svc().from('shakti_volunteers').insert(DEMO_VOLUNTEER_SEED));
  await audit(req, 'demo.reset', { volunteers: DEMO_VOLUNTEER_SEED.length }); res.json({ ok: true, volunteers: DEMO_VOLUNTEER_SEED.length });
}));

export default r;
