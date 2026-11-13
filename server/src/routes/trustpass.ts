import { Router } from 'express';
import { z } from 'zod';
import { ah, dbCheck, HttpError, limiter, parse, requireAuth, svc, type AuthedRequest } from '../lib.js';
import { checkConfirm, checkScan, encodePayload, hashNonce, makeNonce, parsePayload, QR_TTL_MS, trustState, type Challenge } from '../trustpass.js';
import { personCard } from '../walkCards.js';

const r = Router();
r.use(requireAuth);
const A = (req: unknown) => req as AuthedRequest;
const db = () => svc();
const COLS = 'id,journey_id,request_id,issuer_id,scanner_id,nonce_hash,expires_at,scanned_at,verified_at,issuer_confirmed,scanner_confirmed,status';
const view = (c: Challenge & { journey_id: string; request_id: string }, me: string) => ({ id: c.id, journey_id: c.journey_id, request_id: c.request_id, role: me === c.issuer_id ? 'issuer' : 'scanner', state: trustState(c, me, Date.now()), expires_at: c.expires_at });

// Host (the person who accepted) shows a fresh QR for one accepted request. Older unused QRs for it are cancelled.
r.post('/trustpass/issue', limiter(3600_000, 30), ah(async (req, res) => {
  const { userId } = A(req);
  const b = parse(z.object({ journey_id: z.string().uuid(), request_id: z.string().uuid() }).strict(), req.body);
  const j = dbCheck(await db().from('journeys').select('id,owner_id,status,audience').eq('id', b.journey_id).maybeSingle()) as any;
  if (!j || j.owner_id !== userId) throw new HttpError(403, 'NOT_OWNER', 'Only the walk host can show a TrustPass.');
  if (j.status !== 'open') throw new HttpError(409, 'NOT_OPEN', 'This walk is no longer open.');
  if (j.audience === 'teen') throw new HttpError(403, 'TEEN_NO_TRUSTPASS', 'TrustPass between peers is not available for teen walks. Minors only use supervised, consented workflows.');
  const rq = dbCheck(await db().from('journey_requests').select('id,requester_id,status').eq('id', b.request_id).eq('journey_id', b.journey_id).maybeSingle()) as any;
  if (!rq || rq.status !== 'accepted') throw new HttpError(409, 'NOT_ACCEPTED', 'Accept the request first, then show the TrustPass.');
  await db().from('trustpass_challenges').update({ status: 'cancelled' }).eq('request_id', rq.id).in('status', ['issued', 'scanned']);
  const nonce = makeNonce(); const expires = new Date(Date.now() + QR_TTL_MS).toISOString();
  const row = dbCheck(await db().from('trustpass_challenges').insert({ journey_id: j.id, request_id: rq.id, issuer_id: userId, scanner_id: rq.requester_id, nonce_hash: hashNonce(nonce), expires_at: expires }).select('id').single()) as { id: string };
  res.status(201).json({ id: row.id, payload: encodePayload(row.id, nonce), expires_at: expires });
}));

// The requester scans in person. This only marks the QR as used; trust is NOT established until both people confirm.
r.post('/trustpass/scan', limiter(60_000, 15), ah(async (req, res) => {
  const { userId } = A(req);
  const b = parse(z.object({ payload: z.string().max(200) }).strict(), req.body);
  const p = parsePayload(b.payload); if (!p) throw new HttpError(400, 'TRUSTPASS_INVALID', 'That is not a TrustPass code.');
  const c = dbCheck(await db().from('trustpass_challenges').select(COLS).eq('id', p.id).maybeSingle()) as (Challenge & { journey_id: string; request_id: string }) | null;
  if (!c) throw new HttpError(404, 'TRUSTPASS_INVALID', 'This TrustPass is not valid.');
  const v = checkScan(c, userId, p.nonce, Date.now()); if (!v.ok) throw new HttpError(v.code === 'TRUSTPASS_NOT_YOURS' ? 403 : v.code === 'TRUSTPASS_USED' ? 409 : 410, v.code, v.message);
  // Compare-and-set: only one scan can ever succeed.
  const upd = dbCheck(await db().from('trustpass_challenges').update({ status: 'scanned', scanned_at: new Date().toISOString() }).eq('id', c.id).eq('status', 'issued').select('id')) as any[];
  if (!upd.length) throw new HttpError(409, 'TRUSTPASS_USED', 'This TrustPass has already been used. Ask for a new one.');
  const host = dbCheck(await db().from('profiles').select('id,display_name,age_group,age,profession,organisation,photo_status,verification_status,id_method,privacy_name,privacy_photo,privacy_age').eq('id', c.issuer_id).maybeSingle()) as any;
  res.json({ ...view({ ...c, status: 'scanned', scanned_at: new Date().toISOString() }, userId), person: personCard(host) });
}));

r.post('/trustpass/:id/confirm', limiter(60_000, 20), ah(async (req, res) => {
  const { userId } = A(req); const id = parse(z.string().uuid(), req.params.id);
  const c = dbCheck(await db().from('trustpass_challenges').select(COLS).eq('id', id).maybeSingle()) as (Challenge & { journey_id: string; request_id: string }) | null;
  if (!c) throw new HttpError(404, 'NOT_FOUND', 'TrustPass not found.');
  const v = checkConfirm(c, userId, Date.now()); if (!v.ok) throw new HttpError(v.code === 'TRUSTPASS_NOT_YOURS' ? 403 : 409, v.code, v.message);
  const mineKey = userId === c.issuer_id ? 'issuer_confirmed' : 'scanner_confirmed';
  const next = { ...c, [mineKey]: true } as typeof c;
  const both = next.issuer_confirmed && next.scanner_confirmed;
  dbCheck(await db().from('trustpass_challenges').update({ [mineKey]: true, ...(both ? { status: 'verified', verified_at: new Date().toISOString() } : {}) }).eq('id', c.id));
  res.json(view({ ...next, status: both ? 'verified' : c.status }, userId));
}));

r.get('/trustpass/mine', ah(async (req, res) => {
  const { userId } = A(req);
  const rows = dbCheck(await db().from('trustpass_challenges').select(COLS).or(`issuer_id.eq.${userId},scanner_id.eq.${userId}`).order('created_at', { ascending: false }).limit(50)) as any[];
  const latest = new Map<string, any>(); for (const c of rows) if (!latest.has(c.request_id)) latest.set(c.request_id, c);
  res.json([...latest.values()].map(c => view(c, userId)));
}));

// Host only: accepted companions of one walk, so the host can show a QR for each.
r.get('/trustpass/accepted/:journeyId', ah(async (req, res) => {
  const { userId } = A(req); const id = parse(z.string().uuid(), req.params.journeyId);
  const j = dbCheck(await db().from('journeys').select('owner_id').eq('id', id).maybeSingle()) as any;
  if (!j || j.owner_id !== userId) throw new HttpError(403, 'NOT_OWNER', 'Only the walk host can do this.');
  const rows = dbCheck(await db().from('journey_requests').select('id,requester_id').eq('journey_id', id).eq('status', 'accepted')) as any[];
  const out = [];
  for (const x of rows) { const p = dbCheck(await db().from('profiles').select('id,display_name,age_group,age,profession,organisation,photo_status,verification_status,id_method,privacy_name,privacy_photo,privacy_age').eq('id', x.requester_id).maybeSingle()) as any; out.push({ request_id: x.id, person: personCard(p) }); }
  res.json(out);
}));

export default r;
