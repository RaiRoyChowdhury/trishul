// Secret phrase helpers. The readable phrase stays on the device; the server stores only salt + SHA-256 hash.

/** Make two spellings of the same spoken phrase comparable: lowercase, no punctuation, no invisible joiners. */
export function normalize(s: string): string {
  return s.normalize('NFC').replace(/[‌‍]/g, '').toLowerCase().replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function levenshtein(a: string, b: string): number {
  const x = [...a], y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

/** Speech recognisers rarely spell a word exactly the way you typed it, so we allow a small difference. */
export function matchPhrase(transcript: string, phrase: string, tolerance = 0.25): { matched: boolean; score: number } {
  const p = normalize(phrase), t = normalize(transcript);
  if (!p || !t) return { matched: false, score: 1 };
  if (t.includes(p)) return { matched: true, score: 0 };
  const pw = p.split(' '), tw = t.split(' ');
  let best = 1;
  for (const size of [pw.length, pw.length + 1, pw.length - 1].filter(n => n > 0)) {
    for (let i = 0; i + size <= tw.length; i++) {
      const w = tw.slice(i, i + size).join(' ');
      best = Math.min(best, levenshtein(w, p) / Math.max(p.length, w.length));
    }
  }
  return { matched: best <= tolerance, score: best };
}

const toHex = (buf: ArrayBuffer | Uint8Array) => [...new Uint8Array(buf as ArrayBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
export const newSalt = () => toHex(crypto.getRandomValues(new Uint8Array(16)));
export async function hashPhrase(phrase: string, saltHex: string): Promise<string> {
  const data = new TextEncoder().encode(`${saltHex}:${normalize(phrase)}`);
  return toHex(await crypto.subtle.digest('SHA-256', data));
}
export async function verifyPhrase(phrase: string, saltHex: string, hashHex: string) { return (await hashPhrase(phrase, saltHex)) === hashHex; }

// Per-device storage of the readable phrase (needed to match what the microphone hears).
export type PhraseKind = 'sos' | 'nt';
const k = (u: string, kind: PhraseKind) => `trishul.phrase.${kind}.${u}`;
export const phraseStore = {
  get(u: string, kind: PhraseKind): string { try { return localStorage.getItem(k(u, kind)) ?? ''; } catch { return ''; } },
  set(u: string, kind: PhraseKind, v: string) { try { v ? localStorage.setItem(k(u, kind), v) : localStorage.removeItem(k(u, kind)); } catch { /* private mode */ } },
};
