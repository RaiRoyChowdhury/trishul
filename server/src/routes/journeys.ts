import { Router } from 'express';
import { z } from 'zod';
import { ah, dbCheck, HttpError, limiter, parse, requireAuth, svc, type AuthedRequest } from '../lib.js';
import { canRequest, canCreate, displayLabel } from '../walkRules.js';
import { canShareLocation, personCard, walkReady } from '../walkCards.js';
import { env } from '../config.js';

const r = Router();
r.use(requireAuth);
const A = (req: unknown) => req as AuthedRequest;
const db = () => svc();

async function profileOf(id: string) {
  const p = dbCheck(await db().from('profiles').select('id,display_name,age_group,guardian_consent,age,profession,organisation,gender_declared,photo_status,verification_status,id_method,privacy_name,privacy_photo,privacy_age').eq('id', id).maybeSingle()) as any;
  if (!p) throw new HttpError(404, 'PROFILE_MISSING', 'Profile not found.');
  return p;
}
async function blocked(a: string, b: string) {
  const rows = dbCheck(await db().from('blocks').select('blocker_id').or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)) as any[];
  return rows.length > 0;
}
async function journeyOwned(id: string, userId: string) {
  const j = dbCheck(await db().from('journeys').select('*').eq('id', id).maybeSingle()) as any;
  if (!j) throw new HttpError(404, 'NOT_FOUND', 'Journey not found.');
  if (j.owner_id !== userId) throw new HttpError(403, 'NOT_OWNER', 'Only the journey owner can do this.');
  return j;
}

r.post('/journeys', limiter(3600_000, 10), ah(async (req, res) => {
  const { userId } = A(req);
  const b = parse(z.object({
    origin_label: z.string().trim().min(2).max(80), destination_label: z.string().trim().min(2).max(80),
    meeting_point_label: z.string().trim().min(2).max(100), depart_at: z.string().datetime(),
    max_companions: z.number().int().min(1).max(3).default(2),
  }).strict(), req.body);
  const me = await profileOf(userId);
  const verdict = canCreate(me);
  if (!verdict.ok) throw new HttpError(403, verdict.code, verdict.message);
  const ready = walkReady(me, { requireVerified: env.requireVerifiedWalk });
  if (!ready.ok) throw new HttpError(403, ready.code, ready.message);
  const t = Date.parse(b.depart_at);
  if (t < Date.now() - 5 * 60000 || t > Date.now() + 7 * 86400000) throw new HttpError(400, 'BAD_TIME', 'Departure must be within the next 7 days.');
  const j = dbCheck(await db().from('journeys').insert({ ...b, owner_id: userId, audience: me.age_group, max_companions: me.age_group === 'teen' ? Math.min(b.max_companions, 2) : b.max_companions }).select().single()) as any;
  dbCheck(await db().from('journey_participants').insert({ journey_id: j.id, user_id: userId, role: 'owner' }));
  res.status(201).json(j);
}));

r.get('/journeys/discover', ah(async (req, res) => {
  const { userId } = A(req);
  const me = await profileOf(userId);
  const since = new Date(Date.now() - 3600000).toISOString();
  const js = dbCheck(await db().from('journeys').select('*').eq('status', 'open').eq('audience', me.age_group).neq('owner_id', userId).gte('depart_at', since).order('depart_at').limit(50)) as any[];
  const out = [];
  for (const j of js) {
    if (await blocked(userId, j.owner_id)) continue;
    const owner = await profileOf(j.owner_id);
    const parts = dbCheck(await db().from('journey_participants').select('user_id').eq('journey_id', j.id).is('left_at', null)) as any[];
    const mine = dbCheck(await db().from('journey_requests').select('id,status').eq('journey_id', j.id).eq('requester_id', userId).maybeSingle()) as any;
    out.push({ id: j.id, origin_label: j.origin_label, destination_label: j.destination_label, depart_at: j.depart_at, meeting_point_label: j.meeting_point_label,
      audience: j.audience, owner_label: displayLabel(owner), owner: personCard(owner), spots_left: j.max_companions + 1 - parts.length, my_request: mine });
  }
  res.json(out);
}));

r.get('/journeys/mine', ah(async (req, res) => {
  const { userId } = A(req);
  const mem = dbCheck(await db().from('journey_participants').select('journey_id,role').eq('user_id', userId).is('left_at', null)) as any[];
  const ids = mem.map(m => m.journey_id);
  const reqs = dbCheck(await db().from('journey_requests').select('journey_id,status').eq('requester_id', userId).in('status', ['pending', 'declined'])) as any[];
  const allIds = [...new Set([...ids, ...reqs.map(x => x.journey_id)])];
  if (!allIds.length) { res.json([]); return; }
  const js = dbCheck(await db().from('journeys').select('*').in('id', allIds).order('depart_at', { ascending: false })) as any[];
  const out = [];
  for (const j of js) {
    const role = mem.find(m => m.journey_id === j.id)?.role ?? null;
    const parts = dbCheck(await db().from('journey_participants').select('user_id,role').eq('journey_id', j.id).is('left_at', null)) as any[];
    const people = [];
    for (const p of parts) { const pr = await profileOf(p.user_id); people.push({ user_id: p.user_id, role: p.role, label: p.user_id === userId ? 'You' : displayLabel(pr), person: personCard(pr) }); }
    let pending: any[] = [];
    if (role === 'owner') {
      const rq = dbCheck(await db().from('journey_requests').select('id,requester_id,message,status,created_at').eq('journey_id', j.id).eq('status', 'pending')) as any[];
      for (const x of rq) { const rp = await profileOf(x.requester_id); pending.push({ id: x.id, requester_id: x.requester_id, message: x.message, label: displayLabel(rp), person: personCard(rp) }); }
    }
    out.push({ ...j, my_role: role, my_request_status: reqs.find(x => x.journey_id === j.id)?.status ?? null, people, pending_requests: pending });
  }
  res.json(out);
}));

r.post('/journeys/:id/requests', limiter(3600_000, 20), ah(async (req, res) => {
  const { userId } = A(req);
  const b = parse(z.object({ message: z.string().trim().max(200).optional() }).strict(), req.body ?? {});
  const j = dbCheck(await db().from('journeys').select('*').eq('id', req.params.id).maybeSingle()) as any;
  if (!j) throw new HttpError(404, 'NOT_FOUND', 'Journey not found.');
  const me = await profileOf(userId);
  const parts = dbCheck(await db().from('journey_participants').select('user_id').eq('journey_id', j.id).is('left_at', null)) as any[];
  const verdict = canRequest(me, { owner_id: j.owner_id, audience: j.audience, status: j.status, max_companions: j.max_companions, participants: parts.length }, await blocked(userId, j.owner_id));
  if (!verdict.ok) throw new HttpError(403, verdict.code, verdict.message);
  const ready = walkReady(me, { requireVerified: env.requireVerifiedWalk });
  if (!ready.ok) throw new HttpError(403, ready.code, ready.message);
  const row = dbCheck(await db().from('journey_requests').insert({ journey_id: j.id, requester_id: userId, message: b.message ?? null }).select().single());
  res.status(201).json(row);
}));

async function decide(req: any, res: any, decision: 'accepted' | 'declined') {
  const { userId } = A(req);
  const j = await journeyOwned(req.params.id, userId);
  const rq = dbCheck(await db().from('journey_requests').select('*').eq('id', req.params.rid).eq('journey_id', j.id).maybeSingle()) as any;
  if (!rq || rq.status !== 'pending') throw new HttpError(404, 'NOT_FOUND', 'No pending request found.');
  if (decision === 'accepted') {
    if (j.status !== 'open') throw new HttpError(409, 'NOT_OPEN', 'This journey is no longer open.');
    const parts = dbCheck(await db().from('journey_participants').select('user_id').eq('journey_id', j.id).is('left_at', null)) as any[];
    if (parts.length >= j.max_companions + 1) throw new HttpError(409, 'FULL', 'This journey is full.');
    const rp = await profileOf(rq.requester_id);
    if (rp.age_group !== j.audience) throw new HttpError(403, 'AGE_GROUP_MISMATCH', 'Age groups do not match.');
    dbCheck(await db().from('journey_participants').upsert({ journey_id: j.id, user_id: rq.requester_id, role: 'companion', left_at: null }));
  }
  dbCheck(await db().from('journey_requests').update({ status: decision }).eq('id', rq.id));
  res.json({ ok: true, status: decision });
}
r.post('/journeys/:id/requests/:rid/accept', ah((req, res) => decide(req, res, 'accepted')));
r.post('/journeys/:id/requests/:rid/decline', ah((req, res) => decide(req, res, 'declined')));
r.post('/journeys/:id/requests/:rid/cancel', ah(async (req, res) => {
  const { userId } = A(req);
  dbCheck(await db().from('journey_requests').update({ status: 'cancelled' }).eq('id', req.params.rid).eq('requester_id', userId).eq('status', 'pending'));
  res.json({ ok: true });
}));

r.post('/journeys/:id/cancel', ah(async (req, res) => {
  const j = await journeyOwned(req.params.id, A(req).userId);
  if (j.status !== 'open') throw new HttpError(409, 'NOT_OPEN', 'Only an open journey can be cancelled.');
  dbCheck(await db().from('journeys').update({ status: 'cancelled', ended_at: new Date().toISOString() }).eq('id', j.id));
  await db().from('walk_locations').delete().eq('journey_id', j.id);
  dbCheck(await db().from('journey_requests').update({ status: 'cancelled' }).eq('journey_id', j.id).eq('status', 'pending'));
  res.json({ ok: true });
}));
r.post('/journeys/:id/end', ah(async (req, res) => {
  const j = await journeyOwned(req.params.id, A(req).userId);
  dbCheck(await db().from('journeys').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', j.id));
  await db().from('walk_locations').delete().eq('journey_id', j.id);
  res.json({ ok: true });
}));
r.post('/journeys/:id/leave', ah(async (req, res) => {
  const { userId } = A(req);
  dbCheck(await db().from('journey_participants').update({ left_at: new Date().toISOString() }).eq('journey_id', req.params.id).eq('user_id', userId).eq('role', 'companion'));
  await db().from('walk_locations').delete().eq('journey_id', req.params.id).eq('user_id', userId);
  res.json({ ok: true });
}));

// ---- Live location between the people in ONE accepted walk (adults only). Server-only table; stale rows are ignored. ----
const FRESH_MS = 3 * 60_000;
/** People this user has completed a TrustPass with on this walk (both confirmed). Location is shared only with them. */
async function verifiedPeers(journeyId: string, userId: string): Promise<string[]> {
  const rows = dbCheck(await db().from('trustpass_challenges').select('issuer_id,scanner_id').eq('journey_id', journeyId).eq('status', 'verified').or(`issuer_id.eq.${userId},scanner_id.eq.${userId}`)) as any[];
  return [...new Set(rows.map(x => (x.issuer_id === userId ? x.scanner_id : x.issuer_id) as string))];
}
async function activeParticipant(journeyId: string, userId: string) {
  const j = dbCheck(await db().from('journeys').select('id,status').eq('id', journeyId).maybeSingle()) as any;
  if (!j) throw new HttpError(404, 'NOT_FOUND', 'Journey not found.');
  const mine = dbCheck(await db().from('journey_participants').select('user_id').eq('journey_id', journeyId).eq('user_id', userId).is('left_at', null).maybeSingle());
  if (!mine) throw new HttpError(403, 'NOT_PARTICIPANT', 'Only people in this walk can share or see locations.');
  if (j.status !== 'open') throw new HttpError(409, 'NOT_OPEN', 'This walk is no longer active.');
  const c = canShareLocation(await profileOf(userId)); if (!c.ok) throw new HttpError(403, c.code, c.message);
  const peers = await verifiedPeers(journeyId, userId);
  if (!peers.length) throw new HttpError(403, 'TRUSTPASS_REQUIRED', 'Complete a TrustPass in person with your walking companion before sharing location.');
  return peers;
}
r.post('/journeys/:id/location', limiter(60_000, 12), ah(async (req, res) => {
  const { userId } = A(req);
  const b = parse(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict(), req.body);
  await activeParticipant(req.params.id, userId);
  dbCheck(await db().from('walk_locations').upsert({ journey_id: req.params.id, user_id: userId, lat: b.lat, lng: b.lng, updated_at: new Date().toISOString() }));
  res.json({ ok: true });
}));
r.delete('/journeys/:id/location', ah(async (req, res) => {
  await db().from('walk_locations').delete().eq('journey_id', req.params.id).eq('user_id', A(req).userId);
  res.json({ ok: true });
}));
r.get('/journeys/:id/locations', limiter(60_000, 30), ah(async (req, res) => {
  const { userId } = A(req); const peers = await activeParticipant(req.params.id, userId);
  const rows = dbCheck(await db().from('walk_locations').select('user_id,lat,lng,updated_at').eq('journey_id', req.params.id).in('user_id', peers)) as any[];
  const out = [];
  for (const x of rows) {
    const age = Date.now() - Date.parse(x.updated_at); if (age > FRESH_MS) continue;
    if (await blocked(userId, x.user_id)) continue;
    out.push({ user_id: x.user_id, name: displayLabel(await profileOf(x.user_id)), lat: x.lat, lng: x.lng, seconds_ago: Math.round(age / 1000) });
  }
  res.json(out);
}));

// ---- Photos: a person's photo is shown only to adults who can already see their walk (or are connected to it). Never teens. ----
r.get('/people/:id/photo', limiter(60_000, 120), ah(async (req, res) => {
  const { userId } = A(req); const id = parse(z.string().uuid(), req.params.id);
  const subject = await profileOf(id);
  if (id !== userId) {
    const viewer = await profileOf(userId);
    if (subject.age_group === 'teen' || viewer.age_group === 'teen') throw new HttpError(403, 'NO_PHOTO', 'Photo not available.');
    if (subject.photo_status !== 'approved' || subject.privacy_photo === false || await blocked(userId, id)) throw new HttpError(404, 'NO_PHOTO', 'Photo not available.');
    const open = dbCheck(await db().from('journeys').select('id').eq('owner_id', id).eq('status', 'open').limit(1)) as any[];
    const asRequester = dbCheck(await db().from('journey_requests').select('journey_id').eq('requester_id', id).limit(20)) as any[];
    let related = open.length > 0;
    if (!related && asRequester.length) related = (dbCheck(await db().from('journeys').select('id').eq('owner_id', userId).in('id', asRequester.map(x => x.journey_id)).limit(1)) as any[]).length > 0;
    if (!related) throw new HttpError(403, 'NO_PHOTO', 'Photo not available.');
  }
  const dl = await svc().storage.from('avatars').download(id);
  if (dl.error || !dl.data) throw new HttpError(404, 'NO_PHOTO', 'Photo not available.');
  res.setHeader('content-type', dl.data.type || 'image/jpeg'); res.setHeader('cache-control', 'private, max-age=300');
  res.send(Buffer.from(await dl.data.arrayBuffer()));
}));

// Block: only people you actually share (or requested) a journey with. Removes pending requests between you.
r.post('/blocks', limiter(3600_000, 30), ah(async (req, res) => {
  const { userId } = A(req);
  const b = parse(z.object({ user_id: z.string().uuid(), journey_id: z.string().uuid() }).strict(), req.body);
  if (b.user_id === userId) throw new HttpError(400, 'SELF', 'You cannot block yourself.');
  await assertRelated(userId, b.user_id, b.journey_id);
  dbCheck(await db().from('blocks').upsert({ blocker_id: userId, blocked_id: b.user_id }));
  const js = dbCheck(await db().from('journeys').select('id').in('owner_id', [userId, b.user_id])) as any[];
  if (js.length) dbCheck(await db().from('journey_requests').update({ status: 'cancelled' }).in('journey_id', js.map(x => x.id)).in('requester_id', [userId, b.user_id]).eq('status', 'pending'));
  res.json({ ok: true });
}));

r.post('/user-reports', limiter(3600_000, 20), ah(async (req, res) => {
  const { db: udb, userId } = A(req);
  const b = parse(z.object({ reported_user_id: z.string().uuid(), journey_id: z.string().uuid(), reason: z.enum(['harassment', 'unsafe_behaviour', 'fake_profile', 'other']), details: z.string().trim().max(500).optional() }).strict(), req.body);
  await assertRelated(userId, b.reported_user_id, b.journey_id);
  dbCheck(await udb.from('user_reports').insert({ ...b, reporter_id: userId }));
  res.status(201).json({ ok: true });
}));

async function assertRelated(me: string, other: string, journeyId: string) {
  const j = dbCheck(await db().from('journeys').select('owner_id').eq('id', journeyId).maybeSingle()) as any;
  const rel = dbCheck(await db().from('journey_participants').select('user_id').eq('journey_id', journeyId).in('user_id', [me, other])) as any[];
  const rq = dbCheck(await db().from('journey_requests').select('requester_id').eq('journey_id', journeyId).in('requester_id', [me, other])) as any[];
  const involved = new Set([j?.owner_id, ...rel.map(x => x.user_id), ...rq.map(x => x.requester_id)]);
  if (!j || !involved.has(me) || !involved.has(other)) throw new HttpError(403, 'NOT_RELATED', 'You can only do this for people connected to one of your journeys.');
}

export default r;
