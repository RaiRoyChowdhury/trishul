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
const card = (id, name) => ({ id, name, is_teen: false, age: 24, age_band: null, profession: 'student', organisation: null, verified: false, id_method: null, demo_account: true, has_photo: false });
DB['/api/journeys/discover'][0].owner = card('u2', 'Riya');
DB['/api/journeys/mine'][0].people.forEach(x => { x.person = card(x.user_id, x.label); });
DB['/api/journeys/mine'][0].pending_requests.forEach(x => { x.person = card(x.requester_id, x.label); });
const session = { access_token: 'aaa.bbb.ccc', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, user: { id: 'u1', aud: 'authenticated', email: 'd@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };


const HEALTH = { ok: true, services: { supabase: true, sarvam: false, telegram: true, twilio: false, routing: true } };
let offline = false; let sosPosts = 0; const posts = [];
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
      if (p === '/api/journeys' && r.request().method() === 'POST') { posts.push(JSON.parse(r.request().postData())); if (posts.length === 1) return r.fulfill({ status: 403, json: { error: { code: 'PROFILE_INCOMPLETE', message: 'Add your photo first.' } } }); return r.fulfill({ status: 201, json: { id: 'jn1' } }); }
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
const inView = async (loc) => loc.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0; });
(async () => {
  const b = await chromium.launch(); const c = await ctx(b); const pg = await c.newPage(); const U = 'http://localhost:5198';
  pg.on('pageerror', e => console.log('PAGEERR', e.message));
  await pg.setViewportSize({ width: 360, height: 640 });
  await pg.goto(U + '/walk'); await pg.waitForTimeout(2000);
  await pg.getByRole('tab').nth(2).click();
  const btn = pg.getByRole('button', { name: /Publish journey/ });
  log(await btn.isDisabled(), 'publish disabled while fields are empty');
  log(await pg.getByText(/Fill in start, destination and meeting point/).isVisible(), 'a hint says why it is disabled');
  const inputs = pg.locator('section input.input'); await inputs.nth(0).fill('Howrah Station'); await inputs.nth(1).fill('Salt Lake'); await inputs.nth(2).fill('Gate 2');
  log(await btn.isEnabled(), 'publish enabled when filled');
  await btn.click(); await pg.waitForTimeout(1200);
  const err = pg.locator('#walk-msg [role="alert"], #walk-msg .notice, #walk-msg div').first();
  const txt = await pg.locator('#walk-msg').innerText();
  log(/photo|profile|Complete/i.test(txt), 'server refusal is shown next to the button: ' + JSON.stringify(txt));
  log(await inView(pg.locator('#walk-msg')), 'the message is inside the visible screen on a 360x640 phone');
  log(posts.length === 1 && posts[0].origin_label === 'Howrah Station', 'one request sent with trimmed labels');
  await pg.screenshot({ path: OUT + 'walk-publish-error.png' });
  await btn.click(); await pg.waitForTimeout(1500);
  log(posts.length === 2, 'second tap sends again after an error');
  const t2 = await pg.locator('body').innerText();
  log(/Saved/.test(t2) && /My journeys|Howrah Station/.test(t2), 'after success it opens My journeys with "Saved"');
  await b.close();
})();
