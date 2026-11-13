# TRISHUL — women and teen safety ecosystem (prototype)

A multilingual (Bengali-first, Hindi, English) safety web app for Kolkata and Howrah, built for the SEVA First Innovation Challenge.
It is a **working prototype, not a certified safety product**: it does not guarantee safety, does not replace police (112), and says so in the app.

## The six core features
1. **AI Fake Call Companion** — user-made callers, AI replies by Sarvam, spoken aloud by Sarvam voice (or device voice), Sarvam speech-to-text or typed input. **One shared ₹20 lifetime AI budget and an admin-activated 30-day live window; after that it switches to Scripted Demo Mode with recorded voices and zero paid calls**, clear "AI simulation" disclosure.
2. **Safety Map + safe-route comparison** — Leaflet/OpenStreetMap, community reports with reliability labels, feedback buttons, filters, legend, route comparison that counts recent reports along each route.
3. **Secret-Code SOS** — your own phrase (stored as a salted hash on the server, readable only on your device), test mode, countdown, cancel, real notifications, honest delivery status.
4. **Walk Together** — journeys, profile cards, join requests, **TrustPass in-person QR check (both people confirm) before any live location**, privacy settings, report/block, strict teen/adult separation.
5. **Dashboard + Settings** — contacts, callers, language, privacy, accessibility, permissions, data deletion.
6. **No-Touch Alert** — separate phrase + shake gesture, capability detection, test mode, cooldown, immediate disable.

Also built: **Offline Safety Mode** (installable app opens offline, SOS saved and sent later with honest statuses, queued reports, prepared Fake Call, saved map areas, encrypted local data with delete; see docs/OFFLINE-REPORT.md), **Shakti Network** (volunteers, demo profiles clearly marked), **Evidence Vault** (own records, audit log), **Judge Demo Mode** (fictional people, nothing real sent), **Admin Control Centre** (`/admin`), and **phone install (PWA)**.

"Coming Next" lists 5 planned features, with no buttons, labelled *Planned*.

## Quick start
See **docs/SETUP-WINDOWS.md** (step by step). Short version:
```
copy .env.example .env      (then fill in .env)
npm run setup
npm run dev                  -> http://localhost:5173
```

## Project map
```
trishul/
  .env.example            all settings, explained
  supabase/schema.sql     database tables + privacy rules (run once in Supabase)
  server/src/             Express API (TypeScript)
    app.ts, index.ts      server start-up, security headers, CORS, rate limit
    lib.ts                auth check, rate limiters, error handling, database clients
    notify.ts             Telegram + Twilio senders (honest statuses)
    routeScore.ts         pure route-vs-report scoring (tested)
    walkRules.ts          pure teen/adult safety rules (tested)
    routes/               me (profile/settings/contacts/callers), call (AI+voice), map, sos, journeys
  client/src/             React app (TypeScript, Tailwind)
    lib/                  api, auth, i18n, alert engine, phrase hashing/matching, shake detector, speech
    locales/              en.ts (master), bn.ts, hi.ts
    components/           Layout, Logo, AlertOverlay, MapView, PhraseEditor, CallerManager, ui
    pages/                one file per screen
  client/public/assets/   trishul-logo.png (official, untouched), durga-character.png
  docs/                   setup, reports, demo script, learning checklist, handbook, screenshots
```

## Commands
| Command | What it does |
|---|---|
| `npm run setup` | install everything |
| `npm run dev` | start server (8787) + website (5173) |
| `npm test` | run all automated tests |
| `npm run build` | type-check + production build of the website |

## Deployment path (beginner-friendly)
- **Database/auth:** Supabase (already used).
- **Frontend:** Vercel (import the repo, root directory `client`, build command `npm run build`, output `dist`). Set the `VITE_*` variables there, plus `VITE_API_BASE_URL` = your backend URL.
- **Backend:** Render or Railway "Web Service" with root directory `server`, start command `npm start`; add all `.env` values as environment variables; set `CLIENT_ORIGIN` to your Vercel URL.
- HTTPS (given automatically) is required for shake sensors on phones.
Not yet exercised in this build — treat as a recommendation to try, not a tested deployment.

## Honest status
Read **docs/FUNCTIONALITY-REPORT.md** and **docs/TEST-REPORT.md** before presenting. In short: code, rules and screens are built and tested; live integrations (Supabase, OpenAI, ElevenLabs, Telegram, routing) still need your keys and your own test run.
