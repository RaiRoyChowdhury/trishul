import { z } from 'zod';

/** Sarvam cloned-voice ids look like "svc-<uuid>". Stock speakers (shubh, ritu...) never start with "svc-". */
export const isClonedId = (id: string | null | undefined) => !!id && /^svc-[A-Za-z0-9-]{8,60}$/.test(id);

/** The browser always sends mono 16-bit WAV (see client/src/lib/wav.ts). Checks the header and a sane size. */
export function looksLikeWav(b: unknown): b is Buffer {
  return Buffer.isBuffer(b) && b.length > 8_000 && b.length <= 6_000_000
    && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE';
}

export const cloneQuery = z.object({
  name: z.string().trim().min(1).max(100),
  language: z.enum(['bn', 'hi', 'en']),
  consent: z.literal('1', { message: 'Consent is required to clone a voice.' }),
}).strict();

