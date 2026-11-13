import { Router } from 'express';
import { z } from 'zod';
import { ah, dbCheck, HttpError, limiter, parse, requireAuth, svc, type AuthedRequest } from '../lib.js';

// Shakti Network: trained volunteers. Real volunteers appear ONLY after verification + training + safeguarding are all complete.
// Demo volunteers are fictional, flagged is_demo, and never reachable as real people.
const r = Router();
r.use(requireAuth);
const A = (req: unknown) => req as AuthedRequest;
export const bookable = (v: { is_demo: boolean; verification_status: string; training_status: string; safeguarding_status: string; available: boolean }) =>
  v.available && (v.is_demo || (v.verification_status === 'verified' && v.training_status === 'completed' && v.safeguarding_status === 'cleared'));

r.get('/shakti/volunteers', ah(async (req, res) => {
  const area = typeof req.query.area === 'string' ? req.query.area.slice(0, 60) : null;
  let q = svc().from('shakti_volunteers').select('id,display_name,area,verification_status,training_status,safeguarding_status,available,is_demo').order('area');
  if (area) q = q.eq('area', area);
  const rows = dbCheck(await q) as any[];
  res.json(rows.map(v => ({ ...v, bookable: bookable(v) })));
}));
r.post('/shakti/requests', limiter(3600_000, 10), ah(async (req, res) => {
  const { userId } = A(req);
  const b = parse(z.object({ volunteer_id: z.string().uuid(), message: z.string().trim().max(300).optional() }).strict(), req.body);
  const v = dbCheck(await svc().from('shakti_volunteers').select('*').eq('id', b.volunteer_id).maybeSingle()) as any;
  if (!v) throw new HttpError(404, 'NOT_FOUND', 'Volunteer not found.');
  if (v.is_demo) throw new HttpError(409, 'DEMO_VOLUNTEER', 'This is a fictional demo volunteer. No real request is sent.');
  if (!bookable(v)) throw new HttpError(409, 'VOLUNTEER_NOT_READY', 'This volunteer is not yet verified, trained and cleared.');
  const me = dbCheck(await svc().from('profiles').select('age_group,guardian_consent').eq('id', userId).maybeSingle()) as any;
  if (me?.age_group === 'teen' && !me.guardian_consent) throw new HttpError(403, 'GUARDIAN_CONSENT_REQUIRED', 'A guardian must give consent before a teen can request a volunteer.');
  res.status(201).json(dbCheck(await svc().from('shakti_requests').insert({ user_id: userId, volunteer_id: v.id, message: b.message || null }).select().single()));
}));
export default r;
