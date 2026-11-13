import { describe, expect, it } from 'vitest';
import { hashPhrase, matchPhrase, newSalt, normalize, verifyPhrase } from './phrase';
import { ShakeDetector, thresholdFor } from './shake';
import { canTrigger, cooldownLeft, secondsLeft } from './alertRules';
import { dictionaries } from '../locales';
import { en } from '../locales/en';

describe('secret phrase matching', () => {
  it('normalises case, punctuation and joiners', () => {
    expect(normalize('  Bijoya!! ')).toBe('bijoya');
    expect(normalize('বিজয়া।')).toBe('বিজয়া');
  });
  it('matches the phrase inside a longer sentence, in Bengali and English', () => {
    expect(matchPhrase('আমি বলছি বিজয়া বিজয়া', 'বিজয়া').matched).toBe(true);
    expect(matchPhrase('hey please call me BIJOYA now', 'bijoya').matched).toBe(true);
  });
  it('tolerates a small recogniser spelling difference but not unrelated speech', () => {
    expect(matchPhrase('i said bijaya', 'bijoya').matched).toBe(true);
    expect(matchPhrase('good evening how are you', 'bijoya').matched).toBe(false);
    expect(matchPhrase('', 'bijoya').matched).toBe(false);
  });
  it('hashes are salted and verifiable; the readable phrase is not in the hash', async () => {
    const s1 = newSalt(), s2 = newSalt();
    const h1 = await hashPhrase('Bijoya', s1);
    expect(h1).toMatch(/^[0-9a-f]{64}$/); expect(h1).not.toContain('bijoya');
    expect(await hashPhrase('Bijoya', s2)).not.toBe(h1);
    expect(await verifyPhrase('bijoya!', s1, h1)).toBe(true);   // same after normalisation
    expect(await verifyPhrase('other', s1, h1)).toBe(false);
  });
});

describe('shake detector', () => {
  const hit = (d: ShakeDetector, t: number) => d.push(25, 5, 5, t);   // strong spike
  it('fires after 4 strong spikes inside the window', () => {
    let fired = 0; const d = new ShakeDetector(3, () => fired++);
    [0, 200, 400, 600].forEach(t => hit(d, t)); expect(fired).toBe(1);
  });
  it('ignores gentle movement, null sensors and too-slow shaking', () => {
    let fired = 0; const d = new ShakeDetector(3, () => fired++);
    for (let t = 0; t < 5000; t += 150) d.push(0, 0, 10.5, t);           // phone resting / walking
    d.push(null, null, null, 6000);
    [10000, 12000, 14000, 16000].forEach(t => hit(d, t));                // spikes 2 s apart: outside window
    expect(fired).toBe(0);
  });
  it('higher sensitivity lowers the threshold', () => { expect(thresholdFor(5)).toBeLessThan(thresholdFor(1)); });
});

describe('countdown and cooldown rules', () => {
  it('counts down in whole seconds, never below zero', () => { expect(secondsLeft(10_000, 7_500)).toBe(3); expect(secondsLeft(10_000, 12_000)).toBe(0); });
  it('cooldown blocks automatic triggers but never manual SOS or test mode', () => {
    const until = 100_000, now = 50_000;
    expect(canTrigger('no_touch_shake', 'live', until, now)).toBe(false);
    expect(canTrigger('no_touch_voice', 'live', until, now)).toBe(false);
    expect(canTrigger('secret_code', 'live', until, now)).toBe(false);
    expect(canTrigger('manual', 'live', until, now)).toBe(true);
    expect(canTrigger('no_touch_shake', 'test', until, now)).toBe(true);
    expect(canTrigger('no_touch_shake', 'live', until, 100_000)).toBe(true);
    expect(cooldownLeft(until, now)).toBe(50);
  });
});

describe('translations', () => {
  const keys = Object.keys(en);
  it('Bengali and Hindi have exactly the same keys as English', () => {
    for (const l of ['bn', 'hi'] as const) {
      expect(Object.keys(dictionaries[l]).sort()).toEqual([...keys].sort());
      expect(keys.filter(k => !dictionaries[l][k as keyof typeof en]?.trim())).toEqual([]);
    }
  });
  it('placeholders like {n} are preserved in every language', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const l of ['bn', 'hi'] as const) for (const k of keys) expect(ph(dictionaries[l][k as keyof typeof en]), `${l}:${k}`).toBe(ph(en[k as keyof typeof en]));
  });
  it('Bengali and Hindi text really is in their scripts', () => {
    expect(dictionaries.bn['nav.home']).toMatch(/[ঀ-৿]/); expect(dictionaries.hi['nav.home']).toMatch(/[ऀ-ॿ]/);
    const lat = (s: string) => (s.match(/[A-Za-z]/g) ?? []).length / s.length;
    expect(lat(dictionaries.bn['next.shakti.d'])).toBeLessThan(0.1);
  });
});
