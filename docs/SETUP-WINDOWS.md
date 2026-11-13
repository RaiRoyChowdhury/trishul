# TRISHUL setup guide for Windows (beginner)

You will: (1) install two programs, (2) create a free Supabase database, (3) fill in one settings file, (4) start the app.
Everything except step 2 takes about 10 minutes.

## 1. Install the tools (once)
1. **Node.js** (LTS version): https://nodejs.org -> download -> install with all defaults. This lets your PC run JavaScript apps.
2. **VS Code** (a text editor): https://code.visualstudio.com
3. Open **PowerShell** (Start menu -> type "PowerShell"). Check Node works:
   ```
   node -v
   npm -v
   ```
   Both should print version numbers (Node 20 or newer).

## 2. Create the database (Supabase, free)
1. Go to https://supabase.com -> Sign in -> **New project**. Choose any name, a strong database password (save it), region *South Asia (Mumbai)*.
2. Wait about 2 minutes. Left menu -> **SQL Editor** -> **New query**.
3. Open `supabase\schema.sql` from this project, copy everything, paste into the editor, press **Run**. You should see "Success". (This creates every table and the privacy rules.)
4. Left menu -> **Authentication -> Providers -> Email**: for easy testing turn **off** "Confirm email" (otherwise sign-up waits for an email link).
5. Left menu -> **Project Settings -> API**. You need three things: **Project URL**, **anon public** key, **service_role** key.

## 3. Fill in the settings file
1. In the project folder, copy `.env.example` and name the copy `.env` (in PowerShell: `copy .env.example .env`).
2. Open `.env` in VS Code. Paste the Supabase URL and keys (the URL and anon key go in **two** places: the plain names and the `VITE_` names).
3. Optional now, add later: **Sarvam key** (chat, speech, voice: the only AI provider), Telegram bot token (alerts). Each is explained inside `.env.example`.
4. Save. **Never** upload `.env` anywhere or paste the service_role key into chat or screenshots.

## 4. Install and start
In PowerShell, inside the project folder (`cd C:\path\to\trishul`):
```
npm run setup
npm run dev
```
Open http://localhost:5173 . The terminal shows `[ready]` or `[missing]` for each service. The app shows a yellow "Setup needed" box for anything missing; everything else still works.

## 5. First run checklist
1. Create an account (use "18 or older" for a normal account).
2. Settings -> add a trusted contact (tick "this person agreed"). Telegram: the contact opens your bot, presses Start, and you enter their numeric chat id (message @userinfobot to get it). Press **Send test message** - you should receive it.
3. Settings -> turn on location consent if you want location in alerts.
4. Secret-Code SOS -> save a phrase -> **Test your phrase** (Chrome or Edge, allow the microphone).
5. AI Call -> without live AI it shows **Scripted Demo Mode** (works with no key). To use live AI see `docs/ADMIN-AND-SARVAM.md`.
6. Map -> allow location, tap the map, submit a report, refresh: it stays.

## Testing a teen account and Walk Together
Teen accounts are locked until a guardian/institution consent is recorded. For testing only, in Supabase **SQL Editor** run:
```
update public.profiles set guardian_consent = true where display_name = 'Test Teen';
```
Create two adult accounts and two teen accounts to see the age separation (teens never see adult journeys).

## Common problems
| Symptom | Cause / fix |
|---|---|
| Yellow "Cannot reach the TRISHUL server" | `npm run dev` is not running, or port 8787 is busy. Close other terminals and rerun. |
| Sign-up works but sign-in says "Email not confirmed" | Turn off "Confirm email" (step 2.4) or click the link in the email. |
| "Profile not found" after sign-in | `schema.sql` was not run (it creates the profile automatically at sign-up). Run it, then sign up again. |
| Microphone / speech does not work | Use Chrome or Edge on `localhost` or HTTPS; allow the microphone in the address bar. Firefox has no speech recognition. |
| Shake does not work on a phone | Needs HTTPS (see README, deployment) and permission; iPhones ask once. |
| Test message "unavailable" | The contact has no consent ticked, or Telegram/Twilio is not configured in `.env` (restart `npm run dev` after editing). |

## Making yourself an admin (once)
Sign up in the app first. Then in Supabase **SQL Editor** run (replace the name):
```
set session_replication_role = replica;
update public.profiles set role = 'admin' where display_name = 'YOUR NAME';
set session_replication_role = default;
```
(Not tested against your project. If it errors, tell me the message.) Reload the app: an **Admin** item appears.

## Install on a phone
Open the website over HTTPS on the phone. Android/Chrome: use the **Install TRISHUL** button in Settings (or browser menu -> Install app). iPhone/Safari: Share -> Add to Home Screen. On desktop Chrome/Edge: the install icon in the address bar. Camera QR scanning and shake sensors need HTTPS (localhost is fine on the same computer).
