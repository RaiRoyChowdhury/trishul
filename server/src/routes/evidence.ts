import { Router } from 'express';
import { z } from 'zod';
import { ah, dbCheck, HttpError, limiter, parse, requireAuth, svc, type AuthedRequest } from '../lib.js';

// Evidence Vault: a person's OWN records only. Every read, create and delete is written to an audit log.
const r = Router();
r.use(requireAuth);
const A = (req: unknown) => req as AuthedRequest;
const audit = (id: string | null, user: string, action: string) => svc().from('evidence_audit').insert({ evidence_id: id, user_id: user, action });
const COLS = 'id,title,description,incident_at,retention_days,created_at';

r.get('/evidence', ah(async (req, res) => {
  const { db, userId } = A(req);
  const rows = dbCheck(await db.from('evidence_records').select(COLS).eq('user_id', userId).order('incident_at', { ascending: false }).limit(200)) as any[];
  await audit(null, userId, 'list'); res.json(rows);
}));
r.post('/evidence', limiter(3600_000, 60), ah(async (req, res) => {
  const { db, userId } = A(req);
  const b = parse(z.object({ title: z.string().trim().min(1).max(100), description: z.string().trim().max(2000).optional(), incident_at: z.string().datetime().optional(), retention_days: z.number().int().min(1).max(3650).optional() }).strict(), req.body);
  const row = dbCheck(await db.from('evidence_records').insert({ user_id: userId, ...b }).select(COLS).single()) as { id: string };
  await audit(row.id, userId, 'create'); res.status(201).json(row);
}));
r.delete('/evidence/:id', ah(async (req, res) => {
  const { db, userId } = A(req); const id = parse(z.string().uuid(), req.params.id);
  const del = dbCheck(await db.from('evidence_records').delete().eq('id', id).eq('user_id', userId).select('id')) as any[];
  if (!del.length) throw new HttpError(404, 'NOT_FOUND', 'Record not found.');
  await audit(id, userId, 'delete'); res.json({ ok: true });
}));
r.get('/evidence/audit', ah(async (req, res) => {
  const { userId } = A(req);
  res.json(dbCheck(await svc().from('evidence_audit').select('evidence_id,action,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(100)));
}));
export default r;
