// Pure functions (no network): compare walking/driving routes against recent community reports.
export interface Pt { lat: number; lng: number }
export interface Report extends Pt { id: string; category: string; occurred_at: string }
export interface RawRoute { distance: number; duration: number; coordinates: [number, number][] } // GeoJSON order: [lng, lat]

export const NEGATIVE = new Set(['harassment', 'poor_lighting', 'isolated_area', 'unsafe_transport', 'suspicious_activity', 'road_hazard']);

export function haversineM(a: Pt, b: Pt): number {
  const R = 6371000, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Reports within `radiusM` of any sampled point along the route, newer than `maxAgeDays`. */
export function nearbyNegative(coords: [number, number][], reports: Report[], radiusM = 200, maxAgeDays = 90, now = Date.now()) {
  const step = Math.max(1, Math.floor(coords.length / 120));
  const pts = coords.filter((_, i) => i % step === 0 || i === coords.length - 1).map(([lng, lat]) => ({ lat, lng }));
  const out: { id: string; category: string; distance_m: number }[] = [];
  for (const r of reports) {
    if (!NEGATIVE.has(r.category)) continue;
    if (now - Date.parse(r.occurred_at) > maxAgeDays * 86400000) continue;
    let best = Infinity;
    for (const p of pts) best = Math.min(best, haversineM(p, r));
    if (best <= radiusM) out.push({ id: r.id, category: r.category, distance_m: Math.round(best) });
  }
  return out;
}

export function rankRoutes(routes: RawRoute[], reports: Report[]) {
  const scored = routes.map((r, i) => ({ index: i, ...r, nearby: nearbyNegative(r.coordinates, reports) }));
  const fastest = scored.reduce((a, b) => (b.duration < a.duration ? b : a));
  const best = [...scored].sort((a, b) => a.nearby.length - b.nearby.length || a.duration - b.duration)[0];
  const suggested = best.index;
  let explanation: { key: 'same' | 'fewer' | 'none'; fewer?: number; extraMinutes?: number };
  if (suggested === fastest.index) explanation = scored.length === 1 ? { key: 'none' } : { key: 'same' };
  else explanation = { key: 'fewer', fewer: fastest.nearby.length - best.nearby.length, extraMinutes: Math.max(0, Math.round((best.duration - fastest.duration) / 60)) };
  return { routes: scored, suggested, fastest: fastest.index, explanation };
}
