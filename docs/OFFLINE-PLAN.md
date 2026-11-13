# Offline Safety Mode: inspection and staged plan

## What exists today (inspected)
- React PWA shell: `sw.js` caches only the shell and logo; `/api` is never cached (correct). No IndexedDB, no offline pages.
- Alert engine `lib/alert.tsx`: local countdown + cancel already work in the browser; `send()` posts to `/api/sos` and shows an error if offline. The server dedupes on `client_event_id`, so a retried SOS is safe.
- Settings, contacts, journeys are read from the server only (`/me`). Safety reports post to `/api/reports` (accepts `occurred_at`).
- Demo voices: `public/demo-voices/manifest.json` exists but the **audio `.wav` files are not in the project**. They must be generated with `tools/generate_demo_clips.py` (see docs/DEMO-VOICES.md). Offline Fake Call needs them, so this is a prerequisite.
- Leaflet is installed; no tile or routing storage.

## Principles (from the prompt)
SOS is never shown as delivered without confirmation; SMS never promised without signal; prepared audio is never called AI; location only with consent; stale reports never shown as current; existing features unchanged when online.

## Stages (tests after each; one ZIP per milestone)
1. **Shell + status:** service worker precaches app shell, dashboard route, assets, an offline help page; online/offline indicator bar. *Test:* unit test for the status logic; Chromium run with network blocked.
2. **Local store:** IndexedDB (`idb`) for settings snapshot, contacts, saved journeys, report queue, SOS queue. Read-through cache, API unchanged. *Test:* store unit tests (fake-indexeddb).
3. **Offline Fake Call:** cache the demo voices and scripts (bn/hi/en), labelled "Prepared audio, not AI". *Test:* plays with network blocked.
4. **Queued reports + sync:** reports saved locally with their real `occurred_at`, shown as "Queued, not sent", synced when back online with retry and dedupe. Stale (older than 30 days) cached reports show "Old report, unverified".
5. **Offline SOS:** local countdown and cancel; if offline the SOS is queued with statuses *Queued*, *Sending*, *Sent (confirmed by server)*, *Failed*; it never says delivered until the server confirms; sent automatically when back online, with the user told how late it was. Telegram remains the online channel.
6. **Offline TrustPass:** only a clearly labelled "Not verified: offline" local note; no one-time or server validation is claimed; real verification only online.
7. **Encryption + delete:** WebCrypto AES-GCM for sensitive local data (contacts, queued SOS location); key is non-extractable in IndexedDB; "Delete offline data" button; wiped on sign-out. Limit: protects against casual access, not a compromised device.
8. **Offline maps (research + build):** download tiles for a chosen Kolkata/Howrah area into the Cache API with a size cap, OSM attribution and a warning about the OSM tile usage policy (bulk download from the public server is not allowed; use a permitted tile source or self-hosted extract).
9. **Offline routing (investigation only):** compare OSRM/Valhalla compiled to WASM or pre-computed routes for chosen pairs; report feasibility and size; not promised in the app.
10. **Android SMS fallback (Capacitor shell):** native plugin with SEND_SMS permission and explicit consent screen; status shows *SMS handed to the phone*, never *delivered*; needs cellular signal. Built, cannot be tested here.
11. **No-Touch background research:** document Android limits (background microphone needs a foreground service with notification; Android 14+ restrictions; battery optimisation). Nothing claimed beyond what is tested.

## Database / native changes
Server: none required for stages 1-7 (existing idempotent endpoints). Optional: `sos_events.queued_at` to record when a queued alert was created (stage 5). Android: Capacitor project, SMS permission, foreground-service notes.

## Limits (published at the end)
iOS Safari: no silent SMS, limited background and storage eviction; browsers can clear IndexedDB; speech recognition (phrase detection) is online in Chrome; GPS works offline only if the device has it and permission is granted.

## Honest risk to the demo
Offline SOS in the browser can only queue; real offline delivery needs the Android app and cell signal.
