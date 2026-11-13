import { describe, expect, it } from 'vitest';
import { canCreate, canRequest, displayLabel } from './walkRules.js';

const adult = { id: 'a', age_group: 'adult' as const, guardian_consent: false, display_name: 'Anwesha Roy' };
const teen = { id: 't', age_group: 'teen' as const, guardian_consent: true, display_name: 'Durga Sen' };
const open = { owner_id: 'o', audience: 'adult' as const, status: 'open', max_companions: 2, participants: 1 };

describe('Walk Together safety rules', () => {
  it('teen without guardian consent cannot create or request', () => {
    const t = { ...teen, guardian_consent: false };
    expect(canCreate(t)).toMatchObject({ ok: false, code: 'TEEN_GUARDIAN_CONSENT_REQUIRED' });
    expect(canRequest(t, { ...open, audience: 'teen' }, false)).toMatchObject({ ok: false });
  });
  it('never matches a teen with an adult journey (either direction)', () => {
    expect(canRequest(teen, open, false)).toMatchObject({ ok: false, code: 'AGE_GROUP_MISMATCH' });
    expect(canRequest(adult, { ...open, audience: 'teen' }, false)).toMatchObject({ ok: false, code: 'AGE_GROUP_MISMATCH' });
  });
  it('allows same age group, blocks own, blocked, closed and full journeys', () => {
    expect(canRequest(adult, open, false)).toEqual({ ok: true });
    expect(canRequest(teen, { ...open, audience: 'teen' }, false)).toEqual({ ok: true });
    expect(canRequest({ ...adult, id: 'o' }, open, false)).toMatchObject({ code: 'OWN_JOURNEY' });
    expect(canRequest(adult, open, true)).toMatchObject({ code: 'BLOCKED' });
    expect(canRequest(adult, { ...open, status: 'cancelled' }, false)).toMatchObject({ code: 'NOT_OPEN' });
    expect(canRequest(adult, { ...open, participants: 3 }, false)).toMatchObject({ code: 'FULL' });
  });
  it('never shows teen names to others', () => {
    expect(displayLabel(teen)).toBe('Teen walker');
    expect(displayLabel(adult)).toBe('Anwesha');
  });
});
