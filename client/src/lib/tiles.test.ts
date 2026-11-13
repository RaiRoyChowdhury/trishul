import { describe, expect, it } from 'vitest';
import { lat2y, lng2x, tilesFor } from './tiles';
describe('offline map tiles', () => {
  it('converts Kolkata coordinates to the known tile at zoom 13', () => { expect(lng2x(88.3639, 13)).toBe(6106); expect(lat2y(22.5726, 13)).toBe(3568); });
  it('covers the bounds and is capped', () => {
    const b = { south: 22.55, west: 88.34, north: 22.6, east: 88.39 };
    const r = tilesFor(b, [13, 14, 15], 40); expect(r.urls.length).toBeLessThanOrEqual(40); expect(r.truncated).toBe(true); expect(r.urls[0]).toMatch(/\/13\/\d+\/\d+\.png$/);
  });
  it('a small area fits under the cap and is not marked truncated', () => { const r = tilesFor({ south: 22.572, west: 88.363, north: 22.573, east: 88.364 }, [14, 15], 120); expect(r.truncated).toBe(false); expect(r.urls.length).toBeGreaterThan(0); });
});
