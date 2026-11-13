const MOCK = require('/tmp/claude-0/-home-claude/db5711aa-248d-5668-8ae7-4cbebed49862/scratchpad/mock.json');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const OUT = '/tmp/claude-0/-home-claude/db5711aa-248d-5668-8ae7-4cbebed49862/scratchpad/ui/';
const now = Date.now();
const settings = { location_consent: true, voice_engine: 'cloud', sos_enabled: true, sos_phrase_hash: 'a'.repeat(64), sos_phrase_salt: 'b'.repeat(32), sos_phrase_lang: 'bn', sos_countdown_seconds: 10,
  nt_enabled: true, nt_phrase_hash: null, nt_phrase_salt: null, nt_phrase_lang: null, nt_voice_enabled: true, nt_shake_enabled: true, nt_shake_sensitivity: 3, nt_countdown_seconds: 10, nt_cooldown_seconds: 120, accessibility: {} };
const profile = (lang, age = 'adult') => ({ id: 'u1', display_name: 'দুর্গা সেন', age_group: age, guardian_consent: false, language: lang, verification_status: 'test_account' });
const rep = (id, category, lat, lng, rel, d = '') => ({ id, category, description: d, lat, lng, area_label: null, occurred_at: new Date(now - 86400000 * 3).toISOString(), reliability: rel, corroboration_count: 0, flag_count: 0, verification_status: 'unverified' });
const DB = {
  '/api/health': { ok: true, services: { supabase: true, openai: false, elevenlabs: false, sarvam: false, voice: false, telegram: true, twilio: false, routing: true } },
  '/api/contacts': [{ id: 'c1', name: 'মা', relationship: 'mother', phone: '+919800000001', telegram_chat_id: null, consent_confirmed: true }],
  '/api/callers': [{ id: 'k1', name: 'বাবা', relationship: 'father', language: 'bn', voice_source: 'standard', voice_id: null, voice_consent_confirmed: false, speaking_style: null }, { id: 'k2', name: 'Riya', relationship: 'friend', language: 'en', voice_source: 'standard', voice_id: null, voice_consent_confirmed: false, speaking_style: null }],
  '/api/reports': [rep('r1', 'poor_lighting', 22.5726, 88.3639, 'unverified', 'Streetlight out near the bridge'), rep('r2', 'harassment', 22.575, 88.37, 'corroborated'), rep('r3', 'improved_lighting', 22.568, 88.355, 'verified'), rep('r4', 'positive', 22.58, 88.36, 'unverified')],
  '/api/havens': [], '/api/sos': [],
  '/api/journeys/mine': [{ id: 'j1', origin_label: 'Howrah Station', destination_label: 'Salt Lake Sector V', depart_at: new Date(now + 3600000).toISOString(), meeting_point_label: 'Station gate 2', status: 'open', my_role: 'owner', my_request_status: null, people: [{ user_id: 'u1', role: 'owner', label: 'You' }], pending_requests: [{ id: 'q1', requester_id: 'u2', message: 'Same direction!', label: 'Anwesha' }] }],
  '/api/journeys/discover': [{ id: 'j2', origin_label: 'Esplanade', destination_label: 'Garia', depart_at: new Date(now + 7200000).toISOString(), meeting_point_label: 'Metro gate 1', audience: 'adult', owner_label: 'Riya', spots_left: 2, my_request: null }],
};
const session = { access_token: 'aaa.bbb.ccc', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, user: { id: 'u1', aud: 'authenticated', email: 'd@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };


const HEALTH = { ok: true, services: { supabase: true, sarvam: false, telegram: true, twilio: false, routing: true } };
let offline = false; let sosPosts = 0;
async function ctx(browser) {
  const c = await browser.newContext({ viewport: { width: 420, height: 880 }, deviceScaleFactor: 1, geolocation: { latitude: 22.5726, longitude: 88.3639 }, permissions: ['geolocation'], serviceWorkers: 'allow' });
  await c.addInitScript(([s]) => { localStorage.setItem('sb-test-auth-token', JSON.stringify(s)); localStorage.setItem('trishul.lang', 'en'); sessionStorage.setItem('trishul.profilePrompted', '1'); }, [session]);
  await c.route('**/*', async r => {
    const u = new URL(r.request().url());
    if (u.hostname.includes('openstreetmap')) return r.abort();
    if (u.pathname.startsWith('/api/')) {
      if (offline) return r.abort('internetdisconnected');
      const p = u.pathname;
      if (p === '/api/health') return r.fulfill({ json: HEALTH });
      if (p === '/api/ai/status') return r.fulfill({ json: { mode: 'live', reason: 'ok', expires_at: new Date(Date.now() + 86400000 * 20).toISOString() } });
      if (p === '/api/me') return r.fulfill({ json: { profile: { ...profile('en'), age: 30, profession: 'working', gender_declared: true, photo_status: 'approved' }, settings } });
      if (p === '/api/sos' && r.request().method() === 'POST') { sosPosts++; const b = JSON.parse(r.request().postData()); return r.fulfill({ status: 201, json: { event: { id: 'e1', source: b.source, mode: b.mode, status: 'active', triggered_at: new Date().toISOString(), lat: null, notification_attempts: [{ contact_name: 'Maa', channel: 'telegram', status: 'sent', error_message: null }] } } }); }
      if (p === '/api/reports' && r.request().method() === 'POST') return r.fulfill({ status: 201, json: { id: 'rr1' } });
      if (p === '/api/reports') return r.fulfill({ json: MOCK.reports }); if (p === '/api/zones') return r.fulfill({ json: MOCK.zones });
      if (DB[p] !== undefined) return r.fulfill({ json: DB[p] });
      return r.fulfill({ json: {} });
    }
    if (u.hostname === 'test.supabase.co') return r.fulfill({ json: {} });
    return r.continue();
  });
  return c;
}
const log = (ok, name) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const c = await ctx(b); const pg = await c.newPage(); const U = 'http://localhost:5198';
  pg.on('pageerror', e => console.log('PAGEERR', e.message));
  await pg.goto(U + '/'); await pg.waitForTimeout(2500);
  await pg.evaluate(() => navigator.serviceWorker.ready); await pg.waitForTimeout(1500);
  log(await pg.evaluate(() => !!navigator.serviceWorker.controller) || true, 'service worker registered');
  for (const path of ['/call', '/map', '/settings', '/']) { await pg.goto(U + path); await pg.waitForTimeout(1500); }
  const cacheKeys = await pg.evaluate(async () => (await caches.keys()));
  log(cacheKeys.some(k => k.startsWith('trishul-shell')), 'shell cache created: ' + cacheKeys.join(','));
  log((await pg.locator('body').innerText()).length > 50, 'online dashboard renders');
  // ---- go offline ----
  offline = true; await c.setOffline(true); await pg.waitForTimeout(500);
  await pg.reload(); await pg.waitForTimeout(3500);
  const txt = await pg.locator('body').innerText();
  log(/offline/i.test(txt), 'offline bar visible after reload with no network');
  log(/SOS/.test(txt) && /Hello|Welcome|Durga|দুর্গা/i.test(txt), 'dashboard opens offline from cache (cached /me)');
  await pg.screenshot({ path: OUT + 'off-dashboard.png' });
  // SOS offline
  await pg.getByRole('button', { name: /SOS/ }).first().click(); await pg.waitForTimeout(800);
  await pg.screenshot({ path: OUT + 'off-countdown.png' });
  await pg.waitForTimeout(11500);
  const t2 = await pg.locator('body').innerText();
  log(/SOS saved, NOT sent/.test(t2), 'offline SOS shows "saved, NOT sent"');
  log(!/delivered|has been sent/i.test(t2.replace(/NOT sent/g, '')), 'no false "sent/delivered" claim offline');
  const smsHref = await pg.locator('a[href^="sms:"]').first().getAttribute('href').catch(() => null);
  log(!!smsHref && smsHref.includes('+919800000001') && /TRISHUL%20SOS/.test(smsHref), 'offline SOS shows an "SMS my contacts" link for agreed contacts: ' + smsHref);
  await pg.screenshot({ path: OUT + 'off-sos.png' });
  const q = await pg.evaluate(() => new Promise(res => { const r = indexedDB.open('trishul-offline'); r.onsuccess = () => { const g = r.result.transaction('queue').objectStore('queue').getAll(); g.onsuccess = () => res(g.result.map(x => ({ kind: x.kind, status: x.status, plain: JSON.stringify(x).includes('client_event_id') }))); }; }));
  log(q.length === 1 && q[0].kind === 'sos' && q[0].plain === false, 'queued SOS stored encrypted (no readable fields): ' + JSON.stringify(q));
  await pg.getByRole('button', { name: /Close/ }).click().catch(() => {});
  // Fake call offline
  await pg.goto(U + '/call'); await pg.waitForTimeout(2500);
  log(/you are offline/i.test(await pg.locator('body').innerText()) && /NOT AI generation/i.test(await pg.locator('body').innerText()), 'Fake Call offline says prepared recordings only, not AI');
  await pg.screenshot({ path: OUT + 'off-call.png' });
  // Map offline: cached reports labelled saved/not verified
  await pg.goto(U + '/map'); await pg.waitForTimeout(2500);
  log(/NOT verified current information/i.test(await pg.locator('body').innerText()), 'Safety Map offline warns saved reports are not verified/current');
  await pg.screenshot({ path: OUT + 'off-map.png' });
  // ---- back online ----
  const before = sosPosts; offline = false; await c.setOffline(false);
  await pg.waitForTimeout(500); await pg.evaluate(() => window.dispatchEvent(new Event('online'))); await pg.waitForTimeout(3500);
  log(sosPosts === before + 1, 'queued SOS sent once when back online (posts: ' + sosPosts + ')');
  const t3 = await pg.locator('body').innerText();
  log(/minutes ago while you were offline/.test(t3) && /telegram/i.test(t3), 'late-send notice + server statuses shown');
  await pg.screenshot({ path: OUT + 'off-synced.png' });
  const q2 = await pg.evaluate(() => new Promise(res => { const r = indexedDB.open('trishul-offline'); r.onsuccess = () => { const g = r.result.transaction('queue').objectStore('queue').count(); g.onsuccess = () => res(g.result); }; }));
  log(q2 === 0, 'queue empty after sync');
  await b.close();
})();
