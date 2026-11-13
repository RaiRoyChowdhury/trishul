# Demo voices (scripted Demo Mode)

Demo Mode plays pre-recorded clips in a fixed order. No AI, no server, no cost. It sits on the AI Call page under "Demo mode (recorded voices)".

1. Edit `client/public/demo-voices/manifest.json`: set your approved dialogue text for each voice (`father`, `mother`).
2. Make the clips: record a 5-10 s reference of each person (with their permission) and run `tools/generate_demo_clips.py` (IndicF5; untested by the author, needs a GPU such as Google Colab).
3. Put the `.wav` files (names as in the manifest) in `client/public/demo-voices/`.
4. How it plays: opening line on Accept, then one clip each time the user types or speaks a reply. The last clip repeats at the end.
5. If a .wav is missing, the text still shows with a note.
Every demo screen shows "Demo Mode". Never present a cloned voice as the real person.

## Cloning a voice inside the app (live AI calls)
AI Call > Callers > New caller > Voice: "Personalised voice" > Record sample or upload audio (5 to 15 s, one speaker, quiet) > tick consent > Create cloned voice > Save.
Needs `SARVAM_API_KEY` (Sarvam voice cloning is in beta; the Starter plan allows up to 50 cloned voices). The voice is stored in your Sarvam account; TRISHUL keeps only its id on the caller. Not yet tested against a real Sarvam key.
