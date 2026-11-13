# Offline end-to-end check (Chromium, real service worker, network cut)
Needs Playwright. Edit the two paths at the top of `offline-e2e.cjs` (MOCK and playwright require) if needed.
1. `cd client && VITE_SUPABASE_URL=https://test.supabase.co VITE_SUPABASE_ANON_KEY=test npx vite build && npx vite preview --port 5198`
2. `node tests/offline-e2e/offline-e2e.cjs` (prints PASS/FAIL lines). The API is simulated by the script.
