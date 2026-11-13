import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config.js';
import { ah, dbCheck, HttpError, limiter, parse, requireAuth, svc, type AuthedRequest } from '../lib.js';
import { rankRoutes, haversineM, type RawRoute } from '../routeScore.js';
import { buildZones, chooseRoutes, gatherRoutes, type PReport, type Router as RouterFn, straightLineRouter } from '../dangerZones.js';
import { DEMO_TRIP, sampleReports } from '../sampleReports.js';

const r = Router();
const A = (req: unknown) => req as AuthedRequest;
const CATS = ['harassment', 'poor_lighting', 'isolated_area', 'unsafe_transport', 'suspicious_activity', 'road_hazard', 'improved_lighting', 'positive'] as const;

const PUBLIC_COLS = 'id,category,description,lat,lng,area_label,occurred_at,verification_status,corroboration_count,flag_count,created_at';
export function reliability(r: { verification_status: string; corroboration_count: number; flag_count: number }) {
  if (r.verification_status === 'verified') return 'verified';
  if (r.flag_count > r.corroboration_count && r.flag_count >= 2) return 'disputed';
  if (r.corroboration_count >= 2) return 'corroborated';
  return 'unverified';
}

r.get('/reports', requireAuth, ah(async (req, res) => {
  const q = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(90), category: z.enum(CATS).optional() }), req.query);
  const since = new Date(Date.now() - q.days * 86400000).toISOString();
  let query = svc().from('safety_reports').select(PUBLIC_COLS).eq('status', 'active').gte('occurred_at', since).order('occurred_at', { ascending: false }).limit(500);
  if (q.category) query = query.eq('category', q.category);
  const rows = dbCheck(await query) as any[];
  const samples = env.sampleReports ? sampleReports().filter(s => (!q.category || s.category === q.category) && Date.parse(s.occurred_at) >= Date.parse(since)) : [];
  res.json([...rows.map(x => ({ ...x, reliability: reliability(x) })), ...samples.map(({ reporter: _r, ...s }) => s)]);
}));

r.post('/reports', requireAuth, limiter(3600_000, 10), ah(async (req, res) => {
  const { db, userId } = A(req);
  const b = parse(z.object({
    category: z.enum(CATS), description: z.string().trim().max(500).optional(),
    lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180),
    area_label: z.string().trim().max(80).optional(), occurred_at: z.string().datetime().optional(),
  }).strict(), req.body);
  // Privacy: round to 3 decimals (about 110 m) so a report shows an AREA, not a doorstep.
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const when = b.occurred_at && Date.parse(b.occurred_at) <= Date.now() + 60000 ? b.occurred_at : new Date().toISOString();
  const row = dbCheck(await db.from('safety_reports').insert({ ...b, lat: round(b.lat), lng: round(b.lng), occurred_at: when, user_id: userId }).select(PUBLIC_COLS).single()) as any;
  res.status(201).json({ ...row, reliability: reliability(row) });
}));

r.post('/reports/:id/feedback', requireAuth, limiter(3600_000, 60), ah(async (req, res) => {
  const { db, userId } = A(req);
  const kind = parse(z.object({ kind: z.enum(['inaccurate', 'outdated', 'confirm']) }).strict(), req.body).kind;
  const rep = dbCheck(await svc().from('safety_reports').select('id,user_id').eq('id', req.params.id).maybeSingle()) as any;
  if (!rep) throw new HttpError(404, 'NOT_FOUND', 'Report not found.');
  if (rep.user_id === userId) throw new HttpError(400, 'OWN_REPORT', 'You cannot give feedback on your own report.');
  dbCheck(await db.from('report_feedback').upsert({ report_id: rep.id, user_id: userId, kind }));
  const fb = dbCheck(await svc().from('report_feedback').select('kind').eq('report_id', rep.id)) as { kind: string }[];
  const flags = fb.filter(f => f.kind !== 'confirm').length, conf = fb.length - flags;
  dbCheck(await svc().from('safety_reports').update({ flag_count: flags, corroboration_count: conf, status: flags >= 3 && flags > conf ? 'hidden' : 'active' }).eq('id', rep.id));
  res.json({ flag_count: flags, corroboration_count: conf });
}));

r.get('/havens', requireAuth, ah(async (_req, res) => {
  res.json(dbCheck(await svc().from('safe_havens').select('id,name,kind,address,lat,lng,verification_status,verified_at').order('name')));
}));

const osrm: RouterFn = async (pts, alternatives) => {
  const path = pts.map(p => `${p.lng},${p.lat}`).join(';');
  const rsp = await fetch(`${env.routingBase}/route/v1/${env.routingProfile}/${path}?alternatives=${alternatives}&overview=full&geometries=geojson`, { signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!rsp || !rsp.ok) throw new HttpError(502, 'ROUTING_UNAVAILABLE', 'The routing service is unavailable right now. You can still view the map and reports.');
  const j: any = await rsp.json();
  if (j.code !== 'Ok' || !j.routes?.length) throw new HttpError(404, 'NO_ROUTE', 'No route found between those points.');
  return j.routes.slice(0, 3).map((x: any) => ({ distance: x.distance, duration: x.duration, coordinates: x.geometry.coordinates }));
};
async function currentZones() {
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const rows = dbCheck(await svc().from('safety_reports').select('id,category,lat,lng,occurred_at,user_id,verification_status,corroboration_count,flag_count').eq('status', 'active').gte('occurred_at', since).limit(1000)) as any[];
  const reps: (PReport & { sample?: boolean })[] = [
    ...rows.map(x => ({ id: x.id, category: x.category, lat: Number(x.lat), lng: Number(x.lng), occurred_at: x.occurred_at, reporter: String(x.user_id), confidence: ({ verified: 1, corroborated: 0.8, unverified: 0.5, disputed: 0.1 } as Record<string, number>)[reliability(x)] ?? 0.5 })),
    ...(env.sampleReports ? sampleReports().map(s => ({ ...s })) : []),
  ];
  return buildZones(reps, { minPeople: env.dangerMinPeople });
}
// Danger zones = areas reported by at least DANGER_MIN_PEOPLE different people in the last 90 days. Polled by the live map.
r.get('/zones', requireAuth, ah(async (_req, res) => { res.json({ minPeople: env.dangerMinPeople, zones: await currentZones() }); }));

r.get('/route', requireAuth, limiter(60_000, 20), ah(async (req, res) => {
  const pt = z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
  const q = parse(z.object({ from: pt, to: pt, demo: z.literal('1').optional() }), req.query);
  const [fa, fo] = q.from.split(',').map(Number), [ta, to] = q.to.split(',').map(Number);
  const from = { lat: fa, lng: fo }, dest = { lat: ta, lng: to };
  const zones = await currentZones();
  let synthetic = false; let cands: RawRoute[];
  try { cands = await gatherRoutes(osrm, from, dest, zones); }
  catch (e) {
    const isDemo = q.demo === '1' && haversineM(from, { lat: DEMO_TRIP.from[0], lng: DEMO_TRIP.from[1] }) < 300 && haversineM(dest, { lat: DEMO_TRIP.to[0], lng: DEMO_TRIP.to[1] }) < 300;
    if (!(e instanceof HttpError && e.code === 'ROUTING_UNAVAILABLE' && isDemo)) throw e;
    synthetic = true; cands = await gatherRoutes(straightLineRouter, from, dest, zones);
  }
  const { direct, safe, verdict } = chooseRoutes(cands, zones);
  const out = (c: typeof direct | null) => c && { distance: c.distance, duration: c.duration, coordinates: c.coordinates, zoneIds: c.zoneIds };
  res.json({ direct: out(direct), safe: out(safe), verdict, zones, minPeople: env.dangerMinPeople, synthetic,
    extraKm: safe ? Math.max(0, (safe.distance - direct.distance) / 1000) : 0, extraMinutes: safe ? Math.max(0, Math.round((safe.duration - direct.duration) / 60)) : 0 });
}));

export default r;
