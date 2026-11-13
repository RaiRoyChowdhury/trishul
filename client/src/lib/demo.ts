// Scripted demo mode: plays pre-generated clips (made offline with IndicF5) in order.
// No AI, no server and no API cost. Clips are only voices the owner has permission to clone.
import type { Lang } from '../locales';
import type { Caller } from './types';

export interface DemoClip { text: string; file: string }
export interface DemoVoice { id: string; name: string; relationship: string; language: Lang; clips: DemoClip[] }

export function parseManifest(j: unknown): DemoVoice[] {
  const list = (j as { voices?: unknown })?.voices;
  if (!Array.isArray(list)) return [];
  return list.flatMap((v: any) => {
    const clips = Array.isArray(v?.clips) ? v.clips.filter((c: any) => typeof c?.text === 'string' && typeof c?.file === 'string' && !c.file.includes('..')) : [];
    if (typeof v?.id !== 'string' || typeof v?.name !== 'string' || !clips.length) return [];
    return [{ id: v.id, name: v.name, relationship: String(v.relationship ?? ''), language: (['bn', 'hi', 'en'].includes(v.language) ? v.language : 'bn') as Lang, clips }];
  });
}

export async function loadDemoVoices(): Promise<DemoVoice[]> {
  try { const r = await fetch('/demo-voices/manifest.json', { cache: 'no-store' }); return r.ok ? parseManifest(await r.json()) : []; } catch { return []; }
}

// Which clip plays after the n-th user reply (0 = the opening line). The last clip repeats at the end.
export const clipAt = (v: DemoVoice, n: number): DemoClip => v.clips[Math.min(n, v.clips.length - 1)];

export const demoCaller = (v: DemoVoice): Caller => ({ id: `demo-${v.id}`, name: v.name, relationship: v.relationship, language: v.language, voice_source: 'consented_sample', voice_id: null, voice_consent_confirmed: true, speaking_style: null });
export const clipUrl = (f: string) => `/demo-voices/${encodeURIComponent(f)}`;
