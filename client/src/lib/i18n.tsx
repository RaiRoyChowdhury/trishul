import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { translate, type Key, type Lang } from '../locales';
import { en } from '../locales/en';
import { ApiError } from './api';

interface Ctx { lang: Lang; setLang: (l: Lang) => void; t: (k: Key, v?: Record<string, string | number>) => string; err: (e: unknown) => string }
const I18n = createContext<Ctx>(null as unknown as Ctx);
const KEY = 'trishul.lang';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setL] = useState<Lang>(() => { try { const v = localStorage.getItem(KEY); return v === 'hi' || v === 'en' || v === 'bn' ? v : 'bn'; } catch { return 'bn'; } });
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: Lang) => { setL(l); try { localStorage.setItem(KEY, l); } catch { /* ignore */ } }, []);
  const t = useCallback((k: Key, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);
  /** Turns any error into a message in the user's language (falls back to the server's English text). */
  const err = useCallback((e: unknown) => {
    if (e instanceof ApiError) { const k = `err.${e.code}` as Key; return k in en ? translate(lang, k) : e.message; }
    return translate(lang, 'common.error');
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang, t, err }), [lang, setLang, t, err]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}
export const useI18n = () => useContext(I18n);
