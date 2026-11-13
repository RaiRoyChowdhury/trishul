import { describe, expect, it } from 'vitest';
import { haversineM, nearbyNegative, rankRoutes, type Report } from './routeScore.js';

const now = Date.parse('2026-11-09T00:00:00Z');
const line = (lat: number): [number, number][] => Array.from({ length: 30 }, (_, i) => [88.35 + i * 0.0005, lat]);
const rep = (id: string, lat: number, lng: number, category = 'poor_lighting', days = 5): Report =>
  ({ id, lat, lng, category, occurred_at: new Date(now - days * 86400000).toISOString() });

describe('route scoring', () => {
  it('haversine is roughly right (0.001 deg lat ~ 111 m)', () => {
    expect(haversineM({ lat: 22.5, lng: 88 }, { lat: 22.501, lng: 88 })).toBeGreaterThan(105);
    expect(haversineM({ lat: 22.5, lng: 88 }, { lat: 22.501, lng: 88 })).toBeLessThan(117);
  });
  it('counts only recent NEGATIVE reports near the route', () => {
    const r = [rep('a', 22.5, 88.36), rep('b', 22.5, 88.36, 'positive'), rep('c', 22.5, 88.36, 'harassment', 200), rep('d', 22.6, 88.36)];
    expect(nearbyNegative(line(22.5), r, 200, 90, now).map(x => x.id)).toEqual(['a']);
  });
  it('suggests a slightly longer route with fewer reports and explains why', () => {
    const fast = { distance: 1000, duration: 600, coordinates: line(22.5) };
    const slow = { distance: 1200, duration: 780, coordinates: line(22.51) };
    const reports = [rep('1', 22.5, 88.355), rep('2', 22.5, 88.358)];
    const orig = Date.now; Date.now = () => now;
    const out = rankRoutes([fast, slow], reports);
    Date.now = orig;
    expect(out.fastest).toBe(0); expect(out.suggested).toBe(1);
    expect(out.explanation).toEqual({ key: 'fewer', fewer: 2, extraMinutes: 3 });
  });
});
