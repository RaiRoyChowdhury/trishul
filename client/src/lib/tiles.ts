// Offline map areas: the person saves the tiles of the area they are looking at (small, capped).
// Licence/policy: map data is (c) OpenStreetMap contributors (ODbL). The public OSM tile server forbids bulk downloading,
// so saves are capped (default 120 tiles), slow, and the tile source is configurable (VITE_TILE_URL) for a provider that allows offline use.
export const TILE_URL = (import.meta.env.VITE_TILE_URL as string | undefined) ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_CACHE = 'trishul-tiles';
export const MAX_SAVE_TILES = 120;

export const lng2x = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
export const lat2y = (lat: number, z: number) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); };

export interface Bounds { south: number; west: number; north: number; east: number }
/** Tiles covering the bounds for each zoom, nearest zoom first. Stops at `cap`. Returns whether the cap cut it short. */
export function tilesFor(b: Bounds, zooms: number[], cap = MAX_SAVE_TILES): { urls: string[]; truncated: boolean } {
  const urls: string[] = []; let truncated = false;
  for (const z of zooms) {
    const x0 = lng2x(b.west, z), x1 = lng2x(b.east, z), y0 = lat2y(b.north, z), y1 = lat2y(b.south, z);
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      if (urls.length >= cap) { truncated = true; break; }
      urls.push(TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
    }
  }
  return { urls, truncated };
}

export async function saveTiles(urls: string[], onProgress: (done: number) => void): Promise<number> {
  if (typeof caches === 'undefined') throw new Error('NO_CACHE_API');
  const c = await caches.open(TILE_CACHE); let done = 0;
  for (const u of urls) {
    try { if (!(await c.match(u))) { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await c.put(u, r); } done++; } catch { /* skip a failed tile */ }
    onProgress(done); await new Promise(r => setTimeout(r, 250));   // slow on purpose: be polite to the tile server
  }
  return done;
}
export async function savedTileCount(): Promise<number> { return typeof caches === 'undefined' ? 0 : (await (await caches.open(TILE_CACHE)).keys()).length; }
export async function deleteTiles(): Promise<void> { if (typeof caches !== 'undefined') await caches.delete(TILE_CACHE); }
