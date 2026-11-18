// "My scripted voices": each user writes their own script lines and adds their own recordings.
// Script text is kept in this phone's localStorage; the audio goes into the encrypted phone-only store. Nothing is uploaded.
import type { Lang } from '../locales';
import type { DemoVoice } from './demo';
import { deleteLocalClip, putLocalClip } from './localVoices';

const KEY = 'trishul-my-voices';
export interface MyVoice { id: string; name: string; relationship: string; language: Lang; lines: string[] }

export function loadMyVoices(): MyVoice[] {
  try { const j = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(j) ? j.filter(v => v && typeof v.id === 'string' && Array.isArray(v.lines)) : []; } catch { return []; }
}
const save = (list: MyVoice[]) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ } };

const clipName = (id: string, i: number) => `${id}-${i + 1}`;
export const toDemo = (m: MyVoice): DemoVoice => ({ id: m.id, name: m.name, relationship: m.relationship, language: m.language, clips: m.lines.map((text, i) => ({ text, file: clipName(m.id, i) })) });

export async function addMyVoice(base: { name: string; relationship: string; language: Lang }, rows: { text: string; file: File | null }[]): Promise<void> {
  const used = rows.map(r => ({ text: r.text.trim(), file: r.file })).filter(r => r.text);
  if (!used.length) return;
  const id = 'my' + Math.random().toString(36).slice(2, 8);   // letters and digits only
  for (let i = 0; i < used.length; i++) { const f = used[i].file; if (f) await putLocalClip(clipName(id, i), f); }
  save([...loadMyVoices(), { id, ...base, lines: used.map(r => r.text) }]);
}

export async function removeMyVoice(id: string): Promise<void> {
  const list = loadMyVoices(); const v = list.find(x => x.id === id);
  if (v) for (let i = 0; i < v.lines.length; i++) await deleteLocalClip(clipName(id, i));
  save(list.filter(x => x.id !== id));
}