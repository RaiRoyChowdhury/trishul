import type { Lang } from '../locales';
export interface Profile { id: string; display_name: string; age_group: 'teen' | 'adult'; guardian_consent: boolean; language: Lang; verification_status: 'test_account' | 'unverified' | 'verified';
  age?: number | null; profession?: Profession | null; organisation?: string | null; gender_declared?: boolean; photo_status?: 'none' | 'pending' | 'approved' | 'rejected'; id_method?: string | null; role?: 'user' | 'admin'; privacy_name?: 'first' | 'initial'; privacy_photo?: boolean; privacy_age?: boolean }
export type Profession = 'student' | 'working' | 'homemaker' | 'self_employed' | 'other';
export interface PersonCard { id: string; name: string; is_teen: boolean; age: number | null; age_band: 'under18' | null; profession: Profession | null; organisation: string | null; verified: boolean; id_method: string | null; demo_account: boolean; has_photo: boolean }
export interface Settings {
  location_consent: boolean; voice_engine: 'cloud' | 'device'; sos_enabled: boolean;
  sos_phrase_hash: string | null; sos_phrase_salt: string | null; sos_phrase_lang: Lang | null; sos_countdown_seconds: number;
  nt_enabled: boolean; nt_phrase_hash: string | null; nt_phrase_salt: string | null; nt_phrase_lang: Lang | null;
  nt_voice_enabled: boolean; nt_shake_enabled: boolean; nt_shake_sensitivity: number; nt_countdown_seconds: number; nt_cooldown_seconds: number;
  accessibility: { large_text?: boolean; high_contrast?: boolean; reduce_motion?: boolean };
}
export interface Caller { id: string; name: string; relationship: string; language: Lang; voice_source: 'standard' | 'consented_sample'; voice_id: string | null; voice_consent_confirmed: boolean; speaking_style: string | null }
export interface Contact { id: string; name: string; relationship: string | null; phone: string | null; telegram_chat_id: string | null; consent_confirmed: boolean }
export interface Attempt { id?: string; contact_name: string; channel: 'telegram' | 'sms'; status: 'pending' | 'sent' | 'failed' | 'unavailable'; error_message: string | null }
export interface SosEvent { id: string; source: string; mode: 'live' | 'test'; status: string; triggered_at: string; lat: number | null; notification_attempts: Attempt[] }
export interface Health { ok: boolean; services: { supabase: boolean; sarvam: boolean; telegram: boolean; twilio: boolean; routing: boolean } }
