# Offline Safety Mode: report, tests, limits, demo

## What works with no internet (tested in Chromium with the network cut, simulated API)
| Feature | Offline behaviour |
|---|---|
| App opens | Service worker serves the cached shell; settings, contacts, journeys come from an **encrypted** local copy |
| Online/offline bar | Always visible; needs the browser AND the server to answer |
| SOS | Local countdown and cancel work. The alert is **saved on the phone**, screen says "SOS saved, NOT sent", offers **Call 112**. When internet returns it is sent once (server ignores duplicates) and shows the **server's** statuses plus "created N minutes ago" |
| Safety reports | Saved locally with the real time of the incident, shown as "waiting to send", sent when back online |
| Saved reports on the map | Marked **unverified**, with "saved data from <time>, NOT verified current information" |
| Fake Call | Prepared recordings and scripts only (bn/hi/en). Banner: "NOT AI generation". If a recording file is missing it reads the script with the phone's own voice and says so |
| TrustPass | Disabled offline with a warning; no server verification or one-time use is claimed; no live location until verified online |
| Offline maps | "Save this map area" stores up to 120 tiles (z14-15) for the current view; viewed tiles are also kept (max 600). © OpenStreetMap contributors |
| GPS | The browser geolocation works offline only if the phone's GPS hardware provides it and permission is granted |
| Delete controls | Settings -> "Delete offline data" removes copies, queued items and the encryption key; sign-out does the same |

## Needs internet (clearly said in the app)
Telegram SOS delivery, live AI (Sarvam), TrustPass issue/scan/confirm, live location sharing, route comparison, Admin, syncing.

## Tests run (real results)
- `npm test`: client **29 tests passed** (encrypted store, queue order/retry/permanent-failure, sync, online status, offline tiles maths, SMS fallback rules), server **84 passed**.
- `tests/offline-e2e/offline-e2e.cjs` (Chromium + real service worker + network cut): **13 checks passed**: SW and cache created; dashboard opens offline; offline bar; SOS "saved, NOT sent"; no false "sent/delivered"; queued SOS stored encrypted (no readable fields); Fake Call says prepared only, not AI; Map warns data not verified/current; on reconnect exactly **1** SOS sent; late-send notice + server statuses; queue emptied.
- Screenshots: `docs/screenshots/off-*.png`.

## NOT tested (needs a real phone / your accounts)
Android SMS plugin and permission flow; background No-Touch; real tile download over a slow network; iOS Safari behaviour; storage eviction by the browser; real Sarvam/Telegram on reconnect.

## Browser and Android limitations
- **SMS:** a web page cannot send SMS. Only the Android shell can, with the SEND_SMS permission and the user's consent; needs mobile signal; result is only "handed to the phone". iPhone cannot send silently at all. Google Play restricts SEND_SMS.
- **Telegram** is online only.
- **Voice phrase detection** (Secret-Code SOS / No-Touch voice) uses the browser speech service, which in Chrome needs internet. Offline, use the SOS button or shake. On-device recognition is not guaranteed.
- **Background:** web apps cannot listen to the microphone or sensors when the screen is off or the tab is closed. A native Android app would need a **foreground service of type microphone with a visible notification** (Android 14 also needs the FOREGROUND_SERVICE_MICROPHONE permission), and manufacturers' battery savers may still stop it. We do **not** claim background No-Touch. Unverified on a device.
- **Storage:** browsers may clear IndexedDB/caches under storage pressure or "clear site data"; iOS may evict after about 7 days without use. Encryption key is non-extractable but the data is only as safe as the unlocked phone.
- **Maps:** the public OSM tile server prohibits bulk downloads, so saves are small and slow; for large areas use a provider that permits offline use (set `VITE_TILE_URL`).
- **Routing offline:** not implemented; see below.

## Offline routing investigation (not built, not promised)
| Option | Verdict |
|---|---|
| OSRM / Valhalla compiled to WebAssembly with a downloaded Kolkata-Howrah road graph | Experimental, large download, hard to keep current: not recommended for the deadline |
| GraphHopper inside the Android shell with an OSM regional extract | Feasible for native Android; needs device testing and a region extract (size to be measured) |
| Cache the last red/green route result for each saved journey | Cheap, but would show a possibly stale "safe" verdict; would need a clear "saved N days ago" label. Planned |
Danger-zone avoidance needs fresh reports, so offline routes would always be labelled "may be out of date".

## Demo: internet off and on (3 minutes)
1. Online: open the app, Settings, note the Install button. Open Fake Call, Map once (this fills the offline copy).
2. Turn on flight mode. Reload: app opens; grey bar says offline.
3. Press SOS, let the 10 s run out: "SOS saved, NOT sent" + Call 112. Show Fake Call: "prepared recordings, not AI". Show Map: saved-data warning. Try TrustPass: disabled with warning.
4. Turn the internet on: bar turns green "sending saved items", the alert is sent once, the screen shows real Telegram statuses and "created N minutes ago".

## Install / configure
No new server settings or tables. New files: `client/public/sw.js`, `offline.html`; env `VITE_TILE_URL` (optional). Android: `android/README.md`.

## v10 additions
- **SMS my contacts button (any browser).** When an SOS is queued offline, a gold button opens the phone's messaging app with the agreed contacts and the SOS text (and location link if allowed) ready. The person must press Send; a web page cannot send SMS by itself. Uses the person's SIM and needs mobile signal; delivery is never claimed. Contacts come from the phone's saved copy, so open the Dashboard online once first. Tested in Chromium with the network cut (offline-e2e.cjs, 14/14).
- **Voice limit, stated plainly.** Browser speech recognition needs internet. A voice phrase can start the SOS while the connection is alive; with no internet at all the phrase may not be heard. Fully hands-free offline voice SOS needs the Android app with an on-device recogniser (next step).
- **Publish journey fix.** The result of pressing Publish now appears right next to the button (previously at the top of the page, off screen on a phone), the button shows a busy state, a hint explains why it is disabled, and a double tap is ignored. Tested at 360x640 (walk-publish-e2e.cjs, 8/8).
- **Judge Demo hardening.** While Judge Demo Mode is on, every SOS and No-Touch alert is forced to Test mode (nothing is sent) and the fake call never calls the AI. Set `VITE_JUDGE_EMAIL=judge@example.com` (comma separated for more) and that login is always in Judge Demo Mode and cannot switch it off. This is enforced in the app; also keep the judge account free of contacts so even a bypass has nobody to message. Tested in Chromium (judge-demo-e2e.cjs).
- **Copyright line** "© 2026 TRISHUL · Created by Rai Roy Chowdhury" in the app footer and on the login screen.
- **Judge Demo page additions.** A sample QR picture at the TrustPass step (it does not start with the real `TP1.` prefix, so the real scanner ignores it) and a new step 4 that shows the offline SOS card with the "SMS my contacts now" button. The demo SMS link opens the messages app with an EMPTY recipient and a demo text, so nothing is sent unless the person picks a number and presses Send. No Call 112 link in the demo. Tested in Chromium (judge-demo-page-e2e.cjs, 7/7).
