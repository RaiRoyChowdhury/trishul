// TRISHUL service worker v2.
// Caches: app shell + built assets (so the app opens offline), prepared demo voices, viewed map tiles.
// NEVER caches /api (SOS, AI, TrustPass, locations, maps data must always be live; the app keeps its own encrypted copies).
const SHELL = 'trishul-shell-v2', TILES = 'trishul-tiles', VOICES = 'trishul-voices-v1';
const PRECACHE = ['/', '/offline.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/assets/trishul-logo-640.png', '/assets/durga-character.png'];
const TILE_HOSTS = ['tile.openstreetmap.org'], MAX_TILES = 600;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL); await Promise.all(PRECACHE.map(u => c.add(u).catch(() => undefined)));
    // Prepared demo voices (offline Fake Call): the manifest lists the clips. Missing files are skipped, not fatal.
    try {
      const m = await (await fetch('/demo-voices/manifest.json', { cache: 'no-store' })).json(); const v = await caches.open(VOICES);
      await v.add('/demo-voices/manifest.json');
      for (const voice of m.voices ?? []) for (const clip of voice.clips ?? []) { try { await v.add('/demo-voices/' + encodeURIComponent(clip.file)); } catch { /* clip not generated yet */ } }
    } catch { /* no manifest */ }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => { for (const k of await caches.keys()) if (![SHELL, TILES, VOICES].includes(k)) await caches.delete(k); await self.clients.claim(); })());
});

async function trim(name, max) { const c = await caches.open(name); const ks = await c.keys(); if (ks.length > max) for (const k of ks.slice(0, ks.length - max)) await c.delete(k); }

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (TILE_HOSTS.includes(url.hostname)) {   // map tiles: cache what the person has viewed or explicitly saved
    e.respondWith((async () => { const c = await caches.open(TILES); const hit = await c.match(req); if (hit) return hit;
      try { const r = await fetch(req); if (r.ok) { c.put(req, r.clone()); void trim(TILES, MAX_TILES); } return r; } catch { return new Response('', { status: 504 }); } })());
    return;
  }
  if (url.origin !== location.origin || url.pathname.startsWith('/api')) return;   // network only
  if (req.mode === 'navigate') {
    e.respondWith((async () => { try { const r = await fetch(req); const c = await caches.open(SHELL); if (r.ok) c.put('/', r.clone()); return r; }
      catch { return (await caches.match('/')) ?? (await caches.match('/offline.html')) ?? new Response('Offline', { status: 503 }); } })());
    return;
  }
  if (url.pathname.startsWith('/demo-voices/')) {   // prepared voices: cache first
    e.respondWith((async () => { const hit = await caches.match(req, { cacheName: VOICES }); if (hit) return hit; const r = await fetch(req); if (r.ok) (await caches.open(VOICES)).put(req, r.clone()); return r; })());
    return;
  }
  // Built JS/CSS/fonts/images: cache first, refresh in the background.
  e.respondWith((async () => {
    const c = await caches.open(SHELL); const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    return hit ?? (await net) ?? new Response('', { status: 504 });
  })());
});
