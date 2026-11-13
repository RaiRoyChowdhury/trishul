import { describe, expect, it } from 'vitest';
import { ageMatchesGroup, canShareLocation, imageType, personCard, walkReady, type FullProf } from './walkCards.js';

const adult: FullProf = { id: 'a', age_group: 'adult', guardian_consent: false, display_name: 'Ananya Sen', age: 26, profession: 'working', organisation: 'Infosys, Salt Lake', gender_declared: true, photo_status: 'approved', verification_status: 'verified', id_method: 'digilocker' };
const teen: FullProf = { id: 't', age_group: 'teen', guardian_consent: true, display_name: 'Riya Das', age: 16, profession: 'student', organisation: 'Loreto House', gender_declared: true, photo_status: 'approved', verification_status: 'verified', id_method: 'aadhaar_ekyc' };

describe('walker cards', () => {
  it('adult card shows first name, age, profession, workplace, verified badge and photo flag', () => {
    expect(personCard(adult)).toMatchObject({ name: 'Ananya', age: 26, profession: 'working', organisation: 'Infosys, Salt Lake', verified: true, id_method: 'digilocker', has_photo: true, is_teen: false });
  });
  it('teen card never shows name, exact age, school or photo', () => {
    const c = personCard(teen);
    expect(c).toMatchObject({ name: 'Teen walker', age: null, age_band: 'under18', organisation: null, has_photo: false, profession: 'student', is_teen: true });
    expect(JSON.stringify(c)).not.toMatch(/Riya|Loreto|16/);
  });
  it('an unverified test account is marked as demo, not verified, and shows no ID method', () => {
    const c = personCard({ ...adult, verification_status: 'test_account', id_method: 'digilocker' });
    expect(c.verified).toBe(false); expect(c.demo_account).toBe(true); expect(c.id_method).toBeNull();
  });
  it('cards never carry an ID number or image field', () => { expect(Object.keys(personCard(adult)).join()).not.toMatch(/aadhaar_number|id_number|document|image/i); });
});
describe('walk readiness', () => {
  const need = { requireVerified: false };
  it('needs age, profession and declaration', () => {
    expect(walkReady({ ...adult, age: null }, need)).toMatchObject({ ok: false, code: 'PROFILE_INCOMPLETE' });
    expect(walkReady({ ...adult, gender_declared: false }, need)).toMatchObject({ ok: false });
    expect(walkReady(adult, need)).toEqual({ ok: true });
  });
  it('adults need a photo, teens do not', () => {
    expect(walkReady({ ...adult, photo_status: 'none' }, need)).toMatchObject({ ok: false });
    expect(walkReady({ ...adult, photo_status: 'rejected' }, need)).toMatchObject({ ok: false, code: 'PHOTO_REJECTED' });
    expect(walkReady({ ...teen, photo_status: 'none' }, need)).toEqual({ ok: true });
  });
  it('can require government-ID verification', () => {
    expect(walkReady({ ...adult, verification_status: 'test_account' }, { requireVerified: true })).toMatchObject({ ok: false, code: 'VERIFICATION_REQUIRED' });
    expect(walkReady(adult, { requireVerified: true })).toEqual({ ok: true });
  });
});
describe('age, location and image rules', () => {
  it('age must agree with the age group', () => { expect(ageMatchesGroup(16, 'teen')).toBe(true); expect(ageMatchesGroup(22, 'teen')).toBe(false); expect(ageMatchesGroup(17, 'adult')).toBe(false); expect(ageMatchesGroup(18, 'adult')).toBe(true); });
  it('teens cannot share live location', () => { expect(canShareLocation(teen)).toMatchObject({ ok: false, code: 'TEEN_NO_LIVE_LOCATION' }); expect(canShareLocation(adult)).toEqual({ ok: true }); });
  it('recognises real image bytes only', () => {
    expect(imageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('image/jpeg');
    expect(imageType(Buffer.from('<script>alert(1)</script>'))).toBeNull();
  });
});

describe('privacy settings', () => {
  it('can show only an initial, hide age and hide the photo', () => {
    const c = personCard({ ...adult, privacy_name: 'initial', privacy_age: false, privacy_photo: false });
    expect(c).toMatchObject({ name: 'A.', age: null, has_photo: false }); expect(c.age_band).toBeNull();
  });
});
