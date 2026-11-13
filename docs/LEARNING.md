# Your learning checklist and exercises

Tick these as you understand them. Each item points to a file to open.

## Checklist
- [ ] **Client vs server vs database.** The website (client/) runs in the browser; the server (server/) holds secrets and rules; Supabase stores data. (HANDBOOK §2)
- [ ] **What an API request is.** Open `client/src/lib/api.ts`: every call adds your login token and talks to `/api/...`.
- [ ] **What a React component is.** Open `client/src/components/Logo.tsx` (tiny) then `pages/ComingNext.tsx`.
- [ ] **State.** In `pages/Settings.tsx`, find a `useState` and say what changes on screen when it changes.
- [ ] **Translations.** `locales/en.ts` is the master list; `t('key')` looks up text. Try adding a new key.
- [ ] **Validation.** `server/src/routes/me.ts`: the `zod` schemas reject bad input.
- [ ] **Row Level Security.** `supabase/schema.sql` bottom section: policies say "only my rows".
- [ ] **Hashing.** `client/src/lib/phrase.ts`: why the server never sees your phrase.
- [ ] **State machine.** `client/src/lib/alert.tsx`: idle → counting → sending → done.
- [ ] **Pure functions and tests.** `server/src/walkRules.ts` + `walkRules.test.ts`.
- [ ] **Honest errors.** Find where `SUPABASE_NOT_CONFIGURED` is created and where it is shown.
- Next to learn: environment variables, Git basics, what HTTPS is, how deployment works, what an index is in a database.

## Exercises (small, safe)
1. Change `crimson` in `client/tailwind.config.js` slightly and watch the whole app change.
2. Add a 9th report category: edit the SQL check list, `CATS` in `routes/map.ts`, `pages/SafetyMap.tsx`, and add `cat.xxx` in en/bn/hi. Run `npm test` — the translation test will tell you if you missed a language.
3. In `server/src/walkRules.ts`, lower teens' maximum companions to 1 and update the test; run `npm test` in `server`.
4. In `shake.ts` change `required` from 4 to 3 in `alert.tsx` and test on your phone.
5. Add a new `/api/ping` route that returns `{ok:true}` and call it from the browser address bar.

## How to test each feature on its own
- Phrase/shake/cooldown/translations: `npm test --prefix client`. Walk rules/routes/API: `npm test --prefix server`.
- API health: open http://localhost:8787/api/health (shows which services are configured).
- Each page: use the screen's own **Test** buttons; they never send real alerts.
