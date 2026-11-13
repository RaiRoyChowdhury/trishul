import { wipeAll } from './localStore';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './supabase';
import { api } from './api';
import { useI18n } from './i18n';
import type { Health, Profile, Settings } from './types';
import type { Lang } from '../locales';

interface Ctx {
  session: Session | null; loading: boolean; configured: boolean;
  me: { profile: Profile; settings: Settings } | null; meError: string | null; refreshMe: () => Promise<void>;
  health: Health | 'down' | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (o: { email: string; password: string; name: string; age_group: 'teen' | 'adult'; language: Lang }) => Promise<{ needsEmail: boolean }>;
  signOut: () => Promise<void>;
}
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setLang } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Ctx['me']>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | 'down' | null>(null);

  useEffect(() => { api.get<Health>('/health').then(setHealth).catch(() => setHealth('down')); }, []);
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshMe = useCallback(async () => {
    try { const m = await api.get<{ profile: Profile; settings: Settings }>('/me'); setMe(m); setMeError(null); setLang(m.profile.language); }
    catch (e) { setMeError((e as { code?: string }).code ?? 'ERR'); }
  }, [setLang]);
  useEffect(() => { if (session) void refreshMe(); else { setMe(null); setMeError(null); } }, [session, refreshMe]);

  // Apply accessibility preferences to the whole page.
  useEffect(() => {
    const a = me?.settings.accessibility ?? {}, c = document.documentElement.classList;
    c.toggle('large-text', !!a.large_text); c.toggle('high-contrast', !!a.high_contrast); c.toggle('reduce-motion', !!a.reduce_motion);
  }, [me]);

  const value: Ctx = {
    session, loading, configured: supabaseConfigured, me, meError, refreshMe, health,
    signIn: async (email, password) => { const { error } = await supabase!.auth.signInWithPassword({ email, password }); if (error) throw error; },
    signUp: async ({ email, password, name, age_group, language }) => {
      const { data, error } = await supabase!.auth.signUp({ email, password, options: { data: { display_name: name, age_group, language } } });
      if (error) throw error; return { needsEmail: !data.session };
    },
    signOut: async () => { await supabase?.auth.signOut(); await wipeAll().catch(() => undefined); },   // offline copies and queued items belong to the signed-in person
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
