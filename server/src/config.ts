// Reads the ONE shared .env file in the project root. Secrets live only here (server side).
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const e = process.env;
export const env = {
  port: Number(e.PORT ?? 8787),
  clientOrigin: e.CLIENT_ORIGIN ?? 'http://localhost:5173',
  supabaseUrl: e.SUPABASE_URL ?? e.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: e.SUPABASE_ANON_KEY ?? e.VITE_SUPABASE_ANON_KEY ?? '',
  supabaseServiceKey: e.SUPABASE_SERVICE_ROLE_KEY ?? '',
  sarvamKey: e.SARVAM_API_KEY ?? '',
  sarvamModel: e.SARVAM_MODEL ?? 'bulbul:v3',
  sarvamChatModel: e.SARVAM_CHAT_MODEL ?? 'sarvam-105b-conversations',
  sarvamSttModel: e.SARVAM_STT_MODEL ?? 'saaras:v4',
  cloneCreatePaise: Math.max(0, Number(e.SARVAM_CLONE_CREATE_PAISE ?? 100) || 0),
  sarvamSpeaker: e.SARVAM_DEFAULT_SPEAKER ?? 'shubh',
  telegramToken: e.TELEGRAM_BOT_TOKEN ?? '',
  twilioSid: e.TWILIO_ACCOUNT_SID ?? '',
  twilioToken: e.TWILIO_AUTH_TOKEN ?? '',
  twilioFrom: e.TWILIO_FROM_NUMBER ?? '',
  routingBase: (e.ROUTING_BASE_URL ?? 'https://routing.openstreetmap.de/routed-foot').replace(/\/$/, ''),
  routingProfile: e.ROUTING_PROFILE ?? 'driving',
  autoApprovePhotos: (e.AUTO_APPROVE_PHOTOS ?? 'on').toLowerCase() !== 'off',
  requireVerifiedWalk: (e.REQUIRE_VERIFIED_WALK ?? 'off').toLowerCase() === 'on',
  verificationProvider: (e.VERIFICATION_PROVIDER ?? '').toLowerCase(),
  sampleReports: (e.SAMPLE_REPORTS ?? 'on').toLowerCase() !== 'off',
  dangerMinPeople: Math.max(2, Number(e.DANGER_MIN_PEOPLE ?? 4) || 4),
};

/** Which integrations are configured. Contains booleans only, never the secrets themselves. */
export function serviceStatus() {
  return {
    supabase: !!(env.supabaseUrl && env.supabaseAnonKey && env.supabaseServiceKey),
    sarvam: !!env.sarvamKey,
    voice: !!env.sarvamKey,
    telegram: !!env.telegramToken,
    twilio: !!(env.twilioSid && env.twilioToken && env.twilioFrom),
    routing: true, // public OpenStreetMap demo router by default; may be rate limited
  };
}

/** Cloud voice is Sarvam only. */
export function activeVoiceProvider(): 'sarvam' | null {
  return env.sarvamKey ? 'sarvam' : null;
}
