import { describe, expect, it } from 'vitest';
import { buildZones, chooseRoutes, detourVias, distToRouteM, gatherRoutes, straightLineRouter, type PReport } from './dangerZones.js';
import { sampleReports, DEMO_TRIP } from './sampleReports.js';

const now = Date.parse('2026-11-11T00:00:00Z');
const rep = (id: string, who: string, lat: number, lng: number, category = 'harassment', days = 3): PReport => ({ id, reporter: who, lat, lng, category, occurred_at: new Date(now - days * 86400000).toISOString() });

describe('danger zones', () => {
  it('needs 4 DIFFERENT people, not 4 reports from one person', () => {
    const sameUser = [1, 2, 3, 4].map(i => rep(`a${i}`, 'u1', 22.5 + i * 0.0002, 88.36));
    expect(buildZones(sameUser, { now })).toHaveLength(0);
    const three = [1, 2, 3].map(i => rep(`b${i}`, `u${i}`, 22.5 + i * 0.0002, 88.36));
    expect(buildZones(three, { now })).toHaveLength(0);
    const four = [1, 2, 3, 4].map(i => rep(`c${i}`, `u${i}`, 22.5 + i * 0.0002, 88.36));
    const z = buildZones(four, { now }); expect(z).toHaveLength(1); expect(z[0].people).toBe(4);
  });
  it('ignores old reports, positive reports and far-apart reports', () => {
    const mix = [rep('1', 'a', 22.5, 88.36), rep('2', 'b', 22.5001, 88.36), rep('3', 'c', 22.5002, 88.36, 'positive'), rep('4', 'd', 22.5003, 88.36, 'harassment', 200), rep('5', 'e', 22.52, 88.36)];
    expect(buildZones(mix, { now })).toHaveLength(0);
  });
  it('measures distance to a polyline, not just to its vertices', () => {
    const line: [number, number][] = [[88.36, 22.5], [88.37, 22.5]];
    expect(distToRouteM(line, { lat: 22.5009, lng: 88.365 })).toBeLessThan(105);
    expect(distToRouteM(line, { lat: 22.5009, lng: 88.365 })).toBeGreaterThan(95);
  });
  it('sample data: one 5-person zone, the 3-person cluster is not a zone, and there are 10 samples', () => {
    const s = sampleReports(now); expect(s).toHaveLength(10);
    const z = buildZones(s, { now }); expect(z).toHaveLength(1); expect(z[0].people).toBe(5); expect(z[0].sample).toBe(true);
  });
  it('detours go either side of the zone', () => {
    const z = buildZones(sampleReports(now), { now })[0];
    const [a, b] = detourVias({ lat: DEMO_TRIP.from[0], lng: DEMO_TRIP.from[1] }, { lat: DEMO_TRIP.to[0], lng: DEMO_TRIP.to[1] }, z);
    expect(Math.max(a.lat, b.lat)).toBeGreaterThan(z.lat + 0.002); expect(Math.min(a.lat, b.lat)).toBeLessThan(z.lat - 0.002);
  });
  it('demo trip: red direct route through the zone, green longer route that avoids it', async () => {
    const zones = buildZones(sampleReports(now), { now });
    const from = { lat: DEMO_TRIP.from[0], lng: DEMO_TRIP.from[1] }, to = { lat: DEMO_TRIP.to[0], lng: DEMO_TRIP.to[1] };
    const out = chooseRoutes(await gatherRoutes(straightLineRouter, from, to, zones), zones);
    expect(out.verdict).toBe('avoid'); expect(out.direct.zoneIds).toEqual(['z1']);
    expect(out.safe?.zoneIds).toEqual([]); expect(out.safe!.distance).toBeGreaterThan(out.direct.distance);
  });
  it('says "clear" when the shortest route has no zone', async () => {
    const zones = buildZones(sampleReports(now), { now });
    const out = chooseRoutes(await gatherRoutes(straightLineRouter, { lat: 22.60, lng: 88.30 }, { lat: 22.61, lng: 88.31 }, zones), zones);
    expect(out.verdict).toBe('clear'); expect(out.safe).toBeNull();
  });
});

describe('recency and confidence weighting', () => {
  const now = Date.parse('2026-12-01T00:00:00Z'); const at = (days: number) => new Date(now - days * 86400000).toISOString();
  const mk = (n: number, days: number, confidence?: number): PReport[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, category: 'harassment', lat: 22.57 + i * 0.0002, lng: 88.36, occurred_at: at(days), reporter: `u${i}`, confidence }));
  it('fresh credible reports make a zone', () => expect(buildZones(mk(4, 2), { now })).toHaveLength(1));
  it('four 85-day-old reports are too stale to count', () => expect(buildZones(mk(4, 85), { now })).toHaveLength(0));
  it('four unverified reports still count when fresh, four disputed ones never do', () => { expect(buildZones(mk(4, 2, 0.5), { now })).toHaveLength(1); expect(buildZones(mk(4, 2, 0.1), { now })).toHaveLength(0); });
  it('newer reports are stronger', () => expect(buildZones(mk(4, 1), { now })[0].strength).toBeGreaterThan(buildZones(mk(4, 40), { now })[0].strength));
});
