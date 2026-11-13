// Judge Demo Mode: a browser-only switch. While on, pages show FICTIONAL fixtures and nothing real is read, written or sent.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

const KEY = 'trishul.judgeDemo';
/** Emails (comma separated in VITE_JUDGE_EMAIL) that are ALWAYS in Judge Demo Mode: every alert is a test, no AI is used. */
export const judgeEmails = (raw: string | undefined) => (raw ?? '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
export const isJudgeEmail = (email: string | null | undefined, list: string[]) => !!email && list.includes(email.trim().toLowerCase());
const JUDGES = judgeEmails(import.meta.env.VITE_JUDGE_EMAIL as string | undefined);
export interface DemoUser { id: string; name: string; role: string; note: string }
export const DEMO_USERS: DemoUser[] = [
  { id: 'arjun', name: 'Arjun Sen', role: 'Adult user (host)', note: 'Fictional' }, { id: 'rahul', name: 'Rahul Das', role: 'Adult user', note: 'Fictional' },
  { id: 'sayan', name: 'Sayan Roy', role: 'Adult user', note: 'Fictional' }, { id: 'ananya', name: 'Ananya Sen', role: 'Shakti volunteer (demo)', note: 'Fictional' },
  { id: 'riya', name: 'Riya Das', role: 'Emergency contact (demo)', note: 'Fictional' },
];
export const DEMO_VOLUNTEERS = [
  { id: 'd1', display_name: 'Ananya Sen', area: 'Location A', verification_status: 'demo', training_status: 'completed', safeguarding_status: 'cleared', available: true, is_demo: true, bookable: true },
  { id: 'd2', display_name: 'Riya Das', area: 'Location A', verification_status: 'demo', training_status: 'completed', safeguarding_status: 'cleared', available: true, is_demo: true, bookable: true },
  { id: 'd3', display_name: 'Priya Kumari', area: 'Location B', verification_status: 'demo', training_status: 'completed', safeguarding_status: 'cleared', available: true, is_demo: true, bookable: true },
  { id: 'd4', display_name: 'Meera Singh', area: 'Location B', verification_status: 'demo', training_status: 'in_progress', safeguarding_status: 'pending', available: false, is_demo: true, bookable: false },
  { id: 'd5', display_name: 'Suman Jha', area: 'Location C', verification_status: 'demo', training_status: 'completed', safeguarding_status: 'cleared', available: true, is_demo: true, bookable: true },
  { id: 'd6', display_name: 'Kavita Roy', area: 'Location C', verification_status: 'demo', training_status: 'completed', safeguarding_status: 'cleared', available: true, is_demo: true, bookable: true },
];
export const DEMO_EVIDENCE = [
  { id: 'e1', title: 'Followed near bus stop (demo)', description: 'Fictional record: a man followed Arjun Sen for two blocks after 9 pm.', incident_at: '2026-10-02T21:10:00+05:30', retention_days: 90 },
  { id: 'e2', title: 'Unlit lane (demo)', description: 'Fictional record: no streetlights on the lane near Location B.', incident_at: '2026-10-09T20:30:00+05:30', retention_days: 180 },
  { id: 'e3', title: 'Auto driver took a wrong turn (demo)', description: 'Fictional record: Rahul Das noted the route change and used the Fake Call.', incident_at: '2026-10-15T19:45:00+05:30', retention_days: 90 },
  { id: 'e4', title: 'Verbal harassment at market (demo)', description: 'Fictional record: Sayan Roy witnessed comments near Location C.', incident_at: '2026-10-21T18:05:00+05:30', retention_days: 365 },
  { id: 'e5', title: 'Missed SOS test (demo)', description: 'Fictional record: a test alert; no real message was sent.', incident_at: '2026-11-01T11:00:00+05:30', retention_days: 30 },
];

interface Ctx { on: boolean; forced: boolean; set: (v: boolean) => void }
const C = createContext<Ctx>({ on: false, forced: false, set: () => undefined });
export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [manual, setManual] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  const [forced, setForced] = useState(false);   // the signed-in account is the shared judge account
  useEffect(() => {
    if (!supabase || !JUDGES.length) return;
    const check = (email?: string | null) => setForced(isJudgeEmail(email, JUDGES));
    void supabase.auth.getSession().then(({ data }) => check(data.session?.user.email));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => check(s?.user.email));
    return () => sub.subscription.unsubscribe();
  }, []);
  const set = useCallback((v: boolean) => { if (forced) return; setManual(v); try { v ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch { /* ignore */ } }, [forced]);
  return <C.Provider value={{ on: manual || forced, forced, set }}>{children}</C.Provider>;
}
export const useDemoMode = () => useContext(C);
