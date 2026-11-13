// Pure safety rules for Walk Together. Kept separate from the database code so they are easy to read and TEST.
export interface Prof { id: string; age_group: 'teen' | 'adult'; guardian_consent: boolean; display_name?: string }
export type Verdict = { ok: true } | { ok: false; code: string; message: string };
const no = (code: string, message: string): Verdict => ({ ok: false, code, message });

/** Teens may only use Walk Together once a guardian/institution consent is recorded by an administrator. */
export function canCreate(me: Prof): Verdict {
  if (me.age_group === 'teen' && !me.guardian_consent) return no('TEEN_GUARDIAN_CONSENT_REQUIRED', 'Teen accounts need guardian or institution consent before using Walk Together.');
  return { ok: true };
}

export function canRequest(me: Prof, j: { owner_id: string; audience: 'teen' | 'adult'; status: string; max_companions: number; participants: number }, isBlocked: boolean): Verdict {
  if (j.owner_id === me.id) return no('OWN_JOURNEY', 'This is your own journey.');
  if (isBlocked) return no('BLOCKED', 'You cannot request this journey.');
  if (j.status !== 'open') return no('NOT_OPEN', 'This journey is no longer open.');
  // The core teen rule: teens only ever match with teens, adults only with adults. No exceptions.
  if (me.age_group !== j.audience) return no('AGE_GROUP_MISMATCH', 'You can only join journeys from your own age group.');
  const c = canCreate(me); if (!c.ok) return c;
  if (j.participants >= j.max_companions + 1) return no('FULL', 'This journey is full.');
  return { ok: true };
}

/** What strangers see. Teens are never shown by name. */
export function displayLabel(p: Prof): string {
  if (p.age_group === 'teen') return 'Teen walker';
  return (p.display_name ?? 'Walker').split(' ')[0];
}
