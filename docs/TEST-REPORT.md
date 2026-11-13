# Test report (real results from this build)
Run: `npm run typecheck` (clean, client + server) and `npm test`.
- Client: 2 files, **13 tests passed**.
- Server: 11 files, **84 tests passed** (includes route tests run against an in-memory database stand-in: TrustPass full flow, replay, wrong person, expiry, forged nonce; Evidence privacy; Admin guard; demo reset touches only fictional data; recency/confidence zone weighting): AI budget (reserve/settle, concurrency, expiry, failure release, fail-closed, status reasons), Sarvam request/response helpers, danger zones and route choice, walk rules, person cards and privacy, TrustPass (nonce, 2-minute expiry, one-time, wrong person, confirm window, states), Shakti bookable rule.
- `vite build` succeeds. Locale files: bn/hi must have every key of en (compile-time + parity test).
- Screenshots in `docs/screenshots/v8-*.png` (Chromium, simulated API): Admin, TrustPass QR, Settings, Vault, two-map comparison, Judge Demo, Shakti, Fake Call demo.
- Screens opened: Fake Call (demo banner), Judge Demo, Shakti, Evidence, dashboard pages.

## NOT tested (you must try)
Real Sarvam calls, real Supabase (run `supabase/schema.sql`; the new tables/functions never ran), real Telegram, live OSRM routes, camera QR on a phone, PWA install, two-account TrustPass end to end, shake sensor, Admin page against real data.
