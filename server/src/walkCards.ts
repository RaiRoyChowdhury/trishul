// Pure rules for the profile card other walkers see, and for who may use Walk Together. Easy to read and TEST.
import type { Prof, Verdict } from './walkRules.js';

export const PROFESSIONS = ['student', 'working', 'homemaker', 'self_employed', 'other'] as const;
export type Profession = (typeof PROFESSIONS)[number];
export interface FullProf extends Prof {
  age?: number | null; profession?: Profession | null; organisation?: string | null; gender_declared?: boolean; privacy_name?: 'first' | 'initial'; privacy_photo?: boolean; privacy_age?: boolean;
  photo_status?: 'none' | 'pending' | 'approved' | 'rejected'; verification_status?: 'test_account' | 'unverified' | 'verified'; id_method?: 'digilocker' | 'aadhaar_ekyc' | null;
}
export interface PersonCard {
  id: string; name: string; is_teen: boolean; age: number | null; age_band: 'under18' | null;
  profession: Profession | null; organisation: string | null; verified: boolean; id_method: string | null; demo_account: boolean; has_photo: boolean;
}
const no = (code: string, message: string): Verdict => ({ ok: false, code, message });

/** The age must agree with the age group set at sign-up (under 18 = teen). Stops a teen account claiming to be an adult. */
export const ageMatchesGroup = (age: number, group: 'teen' | 'adult') => (age < 18) === (group === 'teen');

/**
 * What a stranger in Walk Together may see. Adults: first name, exact age, profession, workplace or college, verified badge, photo (if approved).
 * Teens: never a name, exact age, school name or photo; only "Teen walker", "under 18", profession and the verified badge.
 * The Aadhaar number or any ID image is never part of a card, because TRISHUL never stores them.
 */
export function personCard(p: FullProf): PersonCard {
  const teen = p.age_group === 'teen'; const verified = p.verification_status === 'verified';
  return {
    id: p.id, name: teen ? 'Teen walker' : p.privacy_name === 'initial' ? `${(p.display_name ?? 'W').slice(0, 1)}.` : (p.display_name ?? 'Walker').split(' ')[0], is_teen: teen,
    age: teen || p.privacy_age === false ? null : p.age ?? null, age_band: teen ? 'under18' : null,
    profession: p.profession ?? null, organisation: teen ? null : p.organisation ?? null,
    verified, id_method: verified ? p.id_method ?? null : null, demo_account: p.verification_status === 'test_account',
    has_photo: !teen && p.photo_status === 'approved' && p.privacy_photo !== false,
  };
}

/** Profile must be complete before creating or requesting a walk. Adults need a photo; teens never show one. */
export function walkReady(p: FullProf, o: { requireVerified: boolean }): Verdict {
  if (!p.age || !p.profession || !p.gender_declared) return no('PROFILE_INCOMPLETE', 'Complete your profile (age, profession and declaration) before using Walk Together.');
  if (p.age_group === 'adult' && (p.photo_status ?? 'none') === 'none') return no('PROFILE_INCOMPLETE', 'Add your photo before using Walk Together.');
  if (p.age_group === 'adult' && p.photo_status === 'rejected') return no('PHOTO_REJECTED', 'Your photo was not accepted. Please upload a clear photo of your face.');
  if (o.requireVerified && p.verification_status !== 'verified') return no('VERIFICATION_REQUIRED', 'Verify your government ID before using Walk Together.');
  return { ok: true };
}

/** Live location is for adults only, and only between people in the same accepted walk. */
export function canShareLocation(p: Prof): Verdict {
  return p.age_group === 'teen' ? no('TEEN_NO_LIVE_LOCATION', 'Live location sharing is not available on teen accounts.') : { ok: true };
}

/** Image bytes check (jpeg / png / webp) so only real images are stored. */
export function imageType(b: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
