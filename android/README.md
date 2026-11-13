# TRISHUL Android shell (SMS fallback). Built, NOT tested here.
Needs: Android Studio, a real phone with a SIM. Steps:
1. `cd client && npm i @capacitor/core @capacitor/cli @capacitor/android` then `npx cap init TRISHUL com.trishul.app --web-dir dist`.
2. `npm run build` (set `VITE_API_BASE_URL` to your deployed server, because `localhost` means the phone itself).
3. `npx cap add android`, then copy `android/plugin/SmsFallbackPlugin.java` to `client/android/app/src/main/java/com/trishul/app/` and register it in `MainActivity.java`: `registerPlugin(SmsFallbackPlugin.class);`
4. In `AndroidManifest.xml` add `<uses-permission android:name="android.permission.SEND_SMS" />`.
5. `npx cap sync android`, open in Android Studio, run on the phone, build an APK.
## In the app
Settings shows the "Offline SMS fallback" switch only inside this shell. Off by default. When on and there is no internet, a saved SOS also hands an SMS to the phone for each contact who agreed. The screen says "handed to the phone", never "delivered".
## Store note
Google Play restricts SEND_SMS to apps whose core purpose is SMS. Share the APK directly for the hackathon, or switch to the user-confirmed `sms:` intent for Play.
