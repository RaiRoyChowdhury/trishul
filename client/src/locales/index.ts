import { en, type Key } from './en';
import { bn } from './bn';
import { hi } from './hi';
export type Lang = 'bn' | 'hi' | 'en';
export const LANGS: { code: Lang; label: string }[] = [{ code: 'bn', label: 'বাংলা' }, { code: 'hi', label: 'हिन्दी' }, { code: 'en', label: 'English' }];
export const dictionaries: Record<Lang, Record<Key, string>> = { en, bn, hi };
export type { Key };
export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  let s = dictionaries[lang][key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
