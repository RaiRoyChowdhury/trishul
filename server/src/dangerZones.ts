// Pure logic (no network): turn community reports into "danger zones" and pick a safer route.
// A street area becomes a danger zone only when at least `minPeople` DIFFERENT people reported it recently.
import { haversineM, NEGATIVE, type Pt, type RawRoute, type Report } from './routeScore.js';

export interface PReport extends Report { reporter: string; confidence?: number }   // confidence 0..1 (verified=1, corroborated=.8, unverified=.5, disputed=.1)
export interface Zone { id: string; lat: number; lng: number; radiusM: number; people: number; reports: number; categories: Record<string, number>; sample: boolean; strength: number }
export interface Candidate extends RawRoute { zoneIds: string[] }
export type Verdict = 'clear' | 'avoid' | 'reduce' | 'none';

export const DEFAULTS = { linkM: 200, minPeople: 4, maxAgeDays: 90, minRadiusM: 150, maxRadiusM: 400, halfLifeDays: 30, minStrengthPerPerson: 0.25 };
/** Weight of one report: halves every 30 days (recency) and is scaled by how well-supported it is (confidence). */
export const reportWeight = (r: PReport, now: number, halfLifeDays = DEFAULTS.halfLifeDays) => (r.confidence ?? 1) * Math.pow(0.5, Math.max(0, now - Date.parse(r.occurred_at)) / (halfLifeDays * 86400000));

/** Group nearby negative reports (within linkM of each other) and keep the groups backed by enough different people. */
export function buildZones(reports: (PReport & { sample?: boolean })[], o: Partial<typeof DEFAULTS> & { now?: number } = {}): Zone[] {
  const { linkM, minPeople, maxAgeDays, minRadiusM, maxRadiusM, halfLifeDays, minStrengthPerPerson } = { ...DEFAULTS, ...o }; const now = o.now ?? Date.now();
  const rs = reports.filter(r => NEGATIVE.has(r.category) && (r.confidence ?? 1) > 0.15 && now - Date.parse(r.occurred_at) <= maxAgeDays * 86400000);
  const parent = rs.map((_, i) => i); const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (haversineM(rs[i], rs[j]) <= linkM) parent[find(i)] = find(j);
  const groups = new Map<number, number[]>(); rs.forEach((_, i) => { const k = find(i); groups.set(k, [...(groups.get(k) ?? []), i]); });
  const zones: Zone[] = [];
  for (const idx of groups.values()) {
    const members = idx.map(i => rs[i]); const people = new Set(members.map(m => m.reporter)).size;
    const strength = members.reduce((s, m) => s + reportWeight(m, now, halfLifeDays), 0);
    if (people < minPeople || strength < minPeople * minStrengthPerPerson) continue;   // enough different people AND enough recent, credible support
    const lat = members.reduce((s, m) => s + m.lat, 0) / members.length, lng = members.reduce((s, m) => s + m.lng, 0) / members.length;
    const far = Math.max(...members.map(m => haversineM({ lat, lng }, m)));
    const categories: Record<string, number> = {}; for (const m of members) categories[m.category] = (categories[m.category] ?? 0) + 1;
    zones.push({ id: '', lat, lng, radiusM: Math.min(maxRadiusM, Math.max(minRadiusM, Math.round(far + 60))), people, reports: members.length, categories, sample: members.every(m => m.sample), strength: Math.round(strength * 100) / 100 });
  }
  zones.sort((a, b) => b.people - a.people); zones.forEach((z, i) => { z.id = `z${i + 1}`; });
  return zones;
}

const M_LAT = 111_320;
/** Shortest distance in metres from a point to a polyline of [lng, lat] points. */
export function distToRouteM(coords: [number, number][], p: Pt): number {
  const kx = M_LAT * Math.cos((p.lat * Math.PI) / 180); let best = Infinity;
  const xy = (c: [number, number]) => [(c[0] - p.lng) * kx, (c[1] - p.lat) * M_LAT] as const;
  for (let i = 0; i < coords.length; i++) {
    const [ax, ay] = xy(coords[i]); if (i === coords.length - 1) { best = Math.min(best, Math.hypot(ax, ay)); break; }
    const [bx, by] = xy(coords[i + 1]); const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}
export const zonesOnRoute = (coords: [number, number][], zones: Zone[]) => zones.filter(z => distToRouteM(coords, z) <= z.radiusM).map(z => z.id);

export function chooseRoutes(routes: RawRoute[], zones: Zone[]) {
  const cands: Candidate[] = routes.map(r => ({ ...r, zoneIds: zonesOnRoute(r.coordinates, zones) }));
  const direct = cands.reduce((a, b) => (b.distance < a.distance ? b : a));      // the shortest route is the "direct" one
  if (!direct.zoneIds.length) return { direct, safe: null as Candidate | null, verdict: 'clear' as Verdict };
  const clean = cands.filter(c => !c.zoneIds.length).sort((a, b) => a.distance - b.distance)[0];
  if (clean) return { direct, safe: clean, verdict: 'avoid' as Verdict };
  const fewer = cands.filter(c => c.zoneIds.length < direct.zoneIds.length).sort((a, b) => a.zoneIds.length - b.zoneIds.length || a.distance - b.distance)[0];
  return fewer ? { direct, safe: fewer, verdict: 'reduce' as Verdict } : { direct, safe: null as Candidate | null, verdict: 'none' as Verdict };
}

/** Two waypoints either side of a zone, perpendicular to the trip direction, just outside the zone. */
export function detourVias(from: Pt, to: Pt, z: Zone, clearanceM = 300): [Pt, Pt] {
  const kx = M_LAT * Math.cos((z.lat * Math.PI) / 180);
  const dx = (to.lng - from.lng) * kx, dy = (to.lat - from.lat) * M_LAT, len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len, off = z.radiusM + clearanceM;
  const at = (s: number): Pt => ({ lat: z.lat + (s * py * off) / M_LAT, lng: z.lng + (s * px * off) / kx });
  return [at(1), at(-1)];
}

export type Router = (waypoints: Pt[], alternatives: boolean) => Promise<RawRoute[]>;

/** Ask the router for alternatives; if the shortest passes through danger zones, also ask for detours around them. */
export async function gatherRoutes(router: Router, from: Pt, to: Pt, zones: Zone[]): Promise<RawRoute[]> {
  const base = await router([from, to], true);
  if (!base.length) return [];
  const direct = base.reduce((a, b) => (b.distance < a.distance ? b : a));
  const hit = zones.filter(z => zonesOnRoute(direct.coordinates, [z]).length).sort((a, b) => haversineM(from, a) - haversineM(from, b)).slice(0, 2);
  if (!hit.length) return base;
  const per = hit.map(z => detourVias(from, to, z));
  const lists: Pt[][] = per.length === 1 ? per[0].map(v => [v]) : per[0].flatMap(a => per[1].map(b => [a, b]));
  const extra = await Promise.all(lists.map(v => router([from, ...v, to], false).catch(() => [] as RawRoute[])));
  return [...base, ...extra.flat()];
}

/** Offline stand-in used ONLY for the built-in demo trip when the routing service cannot be reached: straight lines, not real streets. */
export const straightLineRouter: Router = async (pts) => {
  const coords: [number, number][] = []; let dist = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], d = haversineM(a, b), n = Math.max(1, Math.ceil(d / 40)); dist += d;
    for (let k = 0; k < n; k++) coords.push([a.lng + ((b.lng - a.lng) * k) / n, a.lat + ((b.lat - a.lat) * k) / n]);
  }
  const last = pts[pts.length - 1]; coords.push([last.lng, last.lat]);
  return [{ distance: dist, duration: dist / 1.35, coordinates: coords }];
};
