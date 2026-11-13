import express, { Router } from 'express';
import { z } from 'zod';
import { ah, dbCheck, HttpError, limiter, parse, requireAuth, svc, type AuthedRequest } from '../lib.js';
import { env } from '../config.js';
import { ageMatchesGroup, imageType, PROFESSIONS } from '../walkCards.js';

const r = Router();
r.use(requireAuth);
const A = (req: unknown) => req as AuthedRequest;
const lang = z.enum(['bn', 'hi', 'en']);

r.get('/me', ah(async (req, res) => {
  const { db, userId } = A(req);
  const profile = dbCheck(await db.from('profiles').select('*').eq('id', userId).maybeSingle());
  const settings = dbCheck(await db.from('user_settings').select('*').eq('user_id', userId).maybeSingle());
  if (!profile) throw new HttpError(404, 'PROFILE_MISSING', 'Profile not found. Did you run supabase/schema.sql?');
  res.json({ profile, settings });
}));

r.patch('/me/profile', ah(async (req, res) => {
  const { db, userId } = A(req);
  const b = parse(z.object({ display_name: z.string().trim().min(1).max(60).optional(), language: lang.optional() }).strict(), req.body);
  res.json(dbCheck(await db.from('profiles').update(b).eq('id', userId).select().single()));
}));

// Walk Together profile: age, profession, workplace or college, and the declaration that this is a woman's or girl's account.
r.put('/me/onboarding', ah(async (req, res) => {
  const { db, userId } = A(req);
  const b = parse(z.object({ age: z.number().int().min(13).max(100), profession: z.enum(PROFESSIONS), organisation: z.string().trim().max(80).optional(), gender_declared: z.literal(true) }).strict(), req.body);
  const me = dbCheck(await db.from('profiles').select('age_group').eq('id', userId).maybeSingle()) as { age_group: 'teen' | 'adult' } | null;
  if (!me) throw new HttpError(404, 'PROFILE_MISSING', 'Profile not found.');
  if (!ageMatchesGroup(b.age, me.age_group)) throw new HttpError(400, 'AGE_MISMATCH', me.age_group === 'teen' ? 'A teen account must be under 18.' : 'An adult account must be 18 or older.');
  res.json(dbCheck(await db.from('profiles').update({ age: b.age, profession: b.profession, organisation: b.organisation || null, gender_declared: true }).eq('id', userId).select().single()));
}));

r.put('/me/privacy', ah(async (req, res) => {
  const { db, userId } = A(req);
  const b = parse(z.object({ privacy_name: z.enum(['first', 'initial']), privacy_photo: z.boolean(), privacy_age: z.boolean() }).strict(), req.body);
  res.json(dbCheck(await db.from('profiles').update(b).eq('id', userId).select().single()));
}));

// Photo: the browser sends one resized image. Stored privately; served only by GET /people/:id/photo to allowed people.
r.post('/me/photo', limiter(3600_000, 10), express.raw({ type: () => true, limit: '3mb' }), ah(async (req, res) => {
  const { userId } = A(req);
  const kind = Buffer.isBuffer(req.body) ? imageType(req.body) : null;
  if (!kind || !Buffer.isBuffer(req.body)) throw new HttpError(400, 'BAD_IMAGE', 'Please upload a JPEG, PNG or WebP photo.');
  const up = await svc().storage.from('avatars').upload(`${userId}`, req.body, { contentType: kind, upsert: true });
  if (up.error) throw new HttpError(502, 'PHOTO_FAILED', 'The photo could not be saved. Check that the Supabase schema was applied.');
  // Prototype: photos are approved automatically. For real use set AUTO_APPROVE_PHOTOS=off and review them before approving.
  const status = env.autoApprovePhotos ? 'approved' : 'pending';
  dbCheck(await svc().from('profiles').update({ photo_status: status }).eq('id', userId));
  res.status(201).json({ photo_status: status });
}));

// Government ID verification must go through a licensed provider (DigiLocker or UIDAI e-KYC partner). Not connected in the prototype.
r.post('/me/verify/start', limiter(3600_000, 10), ah(async () => {
  throw new HttpError(503, 'VERIFICATION_NOT_CONFIGURED', env.verificationProvider ? 'Verification provider adapter is not implemented yet.' : 'ID verification is not connected. It needs a licensed DigiLocker or Aadhaar e-KYC provider. For demos, an administrator can mark an account verified.');
}));

const settingsSchema = z.object({
  location_consent: z.boolean(), voice_engine: z.enum(['cloud', 'device']),
  sos_enabled: z.boolean(), sos_countdown_seconds: z.number().int().min(5).max(30),
  nt_enabled: z.boolean(), nt_voice_enabled: z.boolean(), nt_shake_enabled: z.boolean(),
  nt_shake_sensitivity: z.number().int().min(1).max(5), nt_countdown_seconds: z.number().int().min(5).max(30),
  nt_cooldown_seconds: z.number().int().min(30).max(900),
  accessibility: z.object({ large_text: z.boolean().optional(), high_contrast: z.boolean().optional(), reduce_motion: z.boolean().optional() }).strict(),
}).partial().strict();

r.patch('/me/settings', ah(async (req, res) => {
  const { db, userId } = A(req);
  const b = parse(settingsSchema, req.body);
  res.json(dbCheck(await db.from('user_settings').update({ ...b, updated_at: new Date().toISOString() }).eq('user_id', userId).select().single()));
}));

// The browser hashes the phrase itself (SHA-256 + salt). The server never sees the readable phrase.
const hex = z.string().regex(/^[0-9a-f]{64}$/);
r.put('/me/phrase/:kind', ah(async (req, res) => {
  const { db, userId } = A(req);
  const kind = parse(z.enum(['sos', 'nt']), req.params.kind);
  const b = parse(z.object({ hash: hex.nullable(), salt: z.string().regex(/^[0-9a-f]{32}$/).nullable(), lang: lang.nullable() }).strict(), req.body);
  const patch = { [`${kind}_phrase_hash`]: b.hash, [`${kind}_phrase_salt`]: b.salt, [`${kind}_phrase_lang`]: b.lang };
  dbCheck(await db.from('user_settings').update(patch).eq('user_id', userId));
  res.json({ ok: true });
}));

const caller = z.object({
  name: z.string().trim().min(1).max(40), relationship: z.string().trim().min(1).max(40), language: lang,
  voice_source: z.enum(['standard', 'consented_sample']).default('standard'),
  voice_id: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).nullish().transform(v => v || null),
  voice_consent_confirmed: z.boolean().default(false),
  speaking_style: z.string().trim().max(200).nullish().transform(v => v || null),
}).strict().refine(c => c.voice_source === 'standard' || c.voice_consent_confirmed, { message: 'voice_consent_confirmed must be true for a personalised voice' });

r.get('/callers', ah(async (req, res) => { const { db } = A(req); res.json(dbCheck(await db.from('caller_profiles').select('*').order('created_at'))); }));
r.post('/callers', ah(async (req, res) => {
  const { db, userId } = A(req);
  res.status(201).json(dbCheck(await db.from('caller_profiles').insert({ ...parse(caller, req.body), user_id: userId }).select().single()));
}));
r.put('/callers/:id', ah(async (req, res) => {
  const { db } = A(req);
  res.json(dbCheck(await db.from('caller_profiles').update(parse(caller, req.body)).eq('id', req.params.id).select().single()));
}));
r.delete('/callers/:id', ah(async (req, res) => { const { db } = A(req); dbCheck(await db.from('caller_profiles').delete().eq('id', req.params.id)); res.json({ ok: true }); }));

const contact = z.object({
  name: z.string().trim().min(1).max(60), relationship: z.string().trim().max(40).nullish().transform(v => v || null),
  phone: z.string().trim().regex(/^\+[1-9][0-9]{7,14}$/, 'Use international format, e.g. +919876543210').nullish().or(z.literal('')).transform(v => v || null),
  telegram_chat_id: z.string().trim().regex(/^-?[0-9]{5,20}$/).nullish().or(z.literal('')).transform(v => v || null),
  consent_confirmed: z.boolean(),
}).strict().refine(c => c.phone || c.telegram_chat_id, { message: 'Add a phone number or a Telegram chat id' });

r.get('/contacts', ah(async (req, res) => { const { db } = A(req); res.json(dbCheck(await db.from('trusted_contacts').select('*').order('created_at'))); }));
r.post('/contacts', ah(async (req, res) => {
  const { db, userId } = A(req);
  const count = dbCheck(await db.from('trusted_contacts').select('id'))?.length ?? 0;
  if (count >= 5) throw new HttpError(400, 'TOO_MANY_CONTACTS', 'You can add up to 5 trusted contacts.');
  res.status(201).json(dbCheck(await db.from('trusted_contacts').insert({ ...parse(contact, req.body), user_id: userId }).select().single()));
}));
r.put('/contacts/:id', ah(async (req, res) => {
  const { db } = A(req);
  res.json(dbCheck(await db.from('trusted_contacts').update(parse(contact, req.body)).eq('id', req.params.id).select().single()));
}));
r.delete('/contacts/:id', ah(async (req, res) => { const { db } = A(req); dbCheck(await db.from('trusted_contacts').delete().eq('id', req.params.id)); res.json({ ok: true }); }));

// Account + data deletion pathway: deleting the auth user cascades to every table (ON DELETE CASCADE).
r.delete('/me', ah(async (req, res) => {
  const { userId } = A(req);
  const { error } = await svc().auth.admin.deleteUser(userId);
  if (error) throw new HttpError(500, 'DELETE_FAILED', 'Could not delete the account.');
  res.json({ ok: true });
}));

export default r;
