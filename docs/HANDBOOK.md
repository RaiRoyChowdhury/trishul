# TRISHUL technical handbook (for explaining the project to judges)

## 1. One-paragraph summary
TRISHUL is a Bengali-first web app that supports women and teenagers before, during and after a journey: an AI-simulated call to deter unwanted attention, a community safety map with safer-route comparison, a secret-phrase and shake-activated SOS that alerts trusted contacts, and a Walk Together board with strict teen/adult separation. It is a prototype: it never claims to guarantee safety, replace police, verify identities, or work when the app is closed.

## 2. Architecture (how the pieces connect)
```
 Browser (React app, client/)                  Your server (Express, server/)               Other services
 ┌─────────────────────────────┐   /api/...   ┌──────────────────────────────┐
 │ pages, buttons, language    │ ───────────► │ 1. check login token         │ ──► Supabase Auth (who is this?)
 │ speech recognition (mic)    │  + token     │ 2. validate input (zod)      │ ──► Supabase Postgres (data + RLS)
 │ shake sensor, countdown     │ ◄─────────── │ 3. rate limit                │ ──► Sarvam (chat+STT)
 │ phrase hashing (SHA-256)    │   JSON       │ 4. do the work, log safely   │ ──► Sarvam (voice)
 └─────────────────────────────┘              └──────────────────────────────┘ ──► Telegram / Twilio (alerts)
        ▲ sign-in goes straight to Supabase Auth                                  ──► OSM router (routes)
```
Why a server in the middle? Secret keys (Sarvam, Telegram, service role) must never reach the browser, and safety rules (e.g. teen matching) must be enforced where users cannot change them.

## 3. Folder tour
See README "Project map". Rule of thumb: **screens → `client/src/pages`**, **shared logic → `client/src/lib`**, **text → `client/src/locales`**, **API endpoints → `server/src/routes`**, **database → `supabase/schema.sql`**.

## 4. Life of one request: pressing SOS
1. `Layout.tsx` SOS button calls `trigger('manual','live')` in `lib/alert.tsx`.
2. The engine checks: signed in? already counting? cooldown (`alertRules.ts`)? It starts a countdown (default 10 s) and shows `AlertOverlay.tsx`. Nothing has been sent yet.
3. If the user taps **cancel**, the engine goes back to idle; no event exists.
4. At zero, the engine asks the browser for location *only if consent is on*, then `POST /api/sos` with a random `client_event_id`.
5. `server/src/routes/sos.ts` verifies the token, validates the body, stores an `sos_events` row (RLS: own rows), loads contacts, sends one message per contact through `notify.ts`, saves one `notification_attempts` row per contact with the provider's answer.
6. The response returns to the overlay, which shows each contact's honest status. "Accepted by provider" means the provider took the message; it does **not** mean it reached a phone.
7. A retry with the same `client_event_id` returns the old result (no duplicate alerts).

## 5. How each feature works
- **AI Fake Call:** `CallerManager` stores callers (RLS). `FakeCall.tsx` sends the chat so far to `/api/call/reply`; the server builds a system prompt (`buildSystemPrompt`) that makes the model speak as the caller in the chosen language, keep replies short, stay safe, and admit it is an AI if sincerely asked. Speech: cloud voice via `/api/call/tts` (ElevenLabs) or the browser's own voice. A personalised voice is only used when the consent box was ticked (database check constraint + server check).
- **Safety Map:** `MapView.tsx` draws OpenStreetMap with Leaflet. Reports are stored with location rounded to ~110 m. Reliability is computed from community feedback: *unverified* → *corroborated* (≥2 confirmations) → *disputed*; **verified is never set by users**, only by an administrator. Route comparison (`routeScore.ts`) counts recent negative reports within 200 m of each alternative route and suggests the one with fewest, explaining the time cost.
- **Secret-Code SOS:** the phrase is normalised, salted and hashed in the browser (`phrase.ts`); the server stores only salt+hash; the readable phrase stays in this device's local storage so the microphone text can be compared. Matching tolerates small spelling differences (Levenshtein distance ≤ 25%).
- **Walk Together:** all rules live in `walkRules.ts` (pure, tested) and are enforced in `routes/journeys.ts`; database RLS adds a second wall. Journeys contain only place names, never coordinates.
- **Dashboard/Settings:** `settings` PATCH endpoint validates every field; accessibility flags toggle classes on `<html>`.
- **No-Touch:** `ShakeDetector` counts strong acceleration spikes (4 within 1.8 s); sensitivity changes the threshold; the capability panel explains what the device cannot do; cooldown prevents repeated alerts.

## 6. Security and privacy design
Secrets only on the server · service-role key never in the browser · Row Level Security on every table · server verifies the token on every request · zod validation · helmet headers, CORS limited to the site, 50 KB body limit · rate limits (SOS 12/h, reports 10/h, AI 20/min, TTS 30/min) · logs contain no bodies, tokens or phrases · phrases hashed · location only with consent and rounded for reports · teens unnamed and separated · account deletion cascades to all data · no raw voice samples ever stored.

## 7. Honest limits (say these first, judges respect it)
Foreground only (no locked-phone listening) · Chrome's speech service processes audio online · identity and age are not verified · no live location sharing in Walk Together · reports are unmoderated and unverified · "sent" ≠ "delivered" · no police integration · public OSM routing is a demo service.

## 8. Glossary
**API** a menu of requests a server answers · **endpoint** one item on that menu · **JWT/token** a signed pass proving who you are · **RLS** database rules that filter rows per user · **hash** a one-way fingerprint of text · **salt** random text mixed in so equal phrases get different hashes · **state** data a screen remembers · **component** a reusable piece of screen · **env variable** a setting kept outside the code · **rate limit** a cap on how often something can be called · **idempotent** safe to repeat · **mock** a pretend server used in tests.

## 9. Likely judge questions
- *Can it work when the phone is locked?* No, not in a web app; the roadmap is a native Android app. The manual button and Alt+Shift+S work whenever the app is open.
- *How do you stop misuse of reports?* Unverified labelling, community flags that auto-hide disputed reports, rate limits, no names, rounded locations; moderation and partner verification are next.
- *How are teens protected?* Age-separated matching, unnamed display, no coordinates, guardian-consent gate. Real age verification needs a school or guardian partnership.
- *Why not call the police?* That needs an authorised integration; the app says clearly that it has not contacted them.
- *Is the AI voice a real person?* No: labelled simulation, consent required for personalised voices, standard voice by default.
- *What does it cost to run?* Supabase and Telegram free tiers; Sarvam is pay-per-use and capped by the in-app Rs 20 budget; check current pricing.

## 10. Next steps
Run the manual test script in TEST-REPORT.md · record real screenshots · add automated end-to-end tests · native Android listener · moderation dashboard and Safe Haven onboarding · identity/guardian verification partner.
