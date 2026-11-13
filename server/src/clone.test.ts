import { describe, expect, it } from 'vitest';
import { cloneQuery, isClonedId, looksLikeWav } from './clone.js';

const wav = (n: number) => { const b = Buffer.alloc(n); b.write('RIFF', 0); b.write('WAVE', 8); return b; };
describe('voice cloning helpers', () => {
  it('recognises cloned voice ids only', () => {
    expect(isClonedId('svc-123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    for (const s of ['shubh', '', null, undefined, 'svc-', 'svc-../x', 'xsvc-123e4567']) expect(isClonedId(s as string)).toBe(false);
  });
  it('accepts real WAV headers and sane sizes only', () => {
    expect(looksLikeWav(wav(50_000))).toBe(true);
    expect(looksLikeWav(wav(100))).toBe(false);
    expect(looksLikeWav(wav(7_000_000))).toBe(false);
    expect(looksLikeWav(Buffer.alloc(50_000))).toBe(false);
    expect(looksLikeWav('RIFF')).toBe(false);
  });
  it('requires explicit consent and a valid language', () => {
    expect(cloneQuery.safeParse({ name: 'Baba', language: 'bn', consent: '1' }).success).toBe(true);
    expect(cloneQuery.safeParse({ name: 'Baba', language: 'bn' }).success).toBe(false);
    expect(cloneQuery.safeParse({ name: 'Baba', language: 'bn', consent: '0' }).success).toBe(false);
    expect(cloneQuery.safeParse({ name: '', language: 'bn', consent: '1' }).success).toBe(false);
    expect(cloneQuery.safeParse({ name: 'x', language: 'fr', consent: '1' }).success).toBe(false);
  });
});
