# Admin Control Centre, Sarvam AI and the ₹20 budget

## Rules built into the code
- **Sarvam is the only AI provider** (chat, speech-to-text, text-to-speech, voice cloning). No OpenAI, no ElevenLabs.
- **One shared lifetime budget: ₹20** (2000 paise, integers). Every paid call reserves its *estimated* cost first (atomic, in the database), calls Sarvam, then settles the actual cost. A failed call releases the reservation. If the budget cannot be read or reserved, the call is **refused** (fail-closed).
- Only an **admin** can change the budget, and the spent amount **never resets** (the budget cannot be set below what is spent).
- **Live AI runs only when**: an admin pressed *Activate 30-day live AI*, now is inside that 30-day window (stored in UTC), budget remains, and `SARVAM_API_KEY` is set. Otherwise the Fake Call automatically uses **Scripted Demo Mode**: 2 consented prepared voices, pre-generated audio, zero paid calls, with a banner telling the user why.
- Estimates are padded 25% using Sarvam's published pay-as-you-go prices (TTS ≈ 30 paise per 100 chars, STT ≈ 0.82 paise per second, chat ≈ 0.15 / 0.6 paise per 100 input / output tokens). Cloned-voice *creation* price is not published; `SARVAM_CLONE_CREATE_PAISE=100` is an assumption (set 0 to disable cloning).
- **Limit of this design:** the budget is enforced by this app only. It cannot stop charges made directly in the Sarvam dashboard or with the same key elsewhere. Use a dedicated key and set a limit in Sarvam's console too.

## Steps (first time)
1. Put `SARVAM_API_KEY` in `.env`, restart `npm run dev`.
2. Make yourself admin (see SETUP-WINDOWS.md), open **Admin**.
3. Press **Test Sarvam** (one tiny paid call, about 1 paisa; it needs live AI to be active, so activate first), **Test Telegram** (free `getMe`).
4. Press **Activate 30-day live AI** (two taps). The Fake Call now uses live Sarvam.
5. Watch the **ledger**; at ₹0 left or after 30 days the app returns to Demo Mode by itself.

## Honest status
Not run against the real Sarvam API from this build environment (network blocked). Endpoints and models were taken from Sarvam's docs; the first real test is yours. `reasoning_effort` is deliberately not sent because Sarvam's docs conflict.
