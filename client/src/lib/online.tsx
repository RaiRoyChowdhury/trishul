import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { decideNet, type Net } from './onlineStatus';

const BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/$/, '') + '/api';
const C = createContext<{ net: Net; online: boolean; checkNow: () => void }>({ net: 'checking', online: true, checkNow: () => undefined });

export function OnlineProvider({ children }: { children: ReactNode }) {
  const [nav, setNav] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [probe, setProbe] = useState<'ok' | 'fail' | 'none'>('none'); const busy = useRef(false);
  const check = useCallback(async () => {
    if (busy.current) return; busy.current = true;
    try { const r = await fetch(`${BASE}/health`, { cache: 'no-store', signal: AbortSignal.timeout(4000) }); setProbe(r.ok ? 'ok' : 'fail'); } catch { setProbe('fail'); } finally { busy.current = false; }
  }, []);
  useEffect(() => {
    const on = () => { setNav(true); void check(); }; const off = () => { setNav(false); setProbe('fail'); };
    window.addEventListener('online', on); window.addEventListener('offline', off); void check(); const i = setInterval(() => void check(), 20000);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(i); };
  }, [check]);
  const net = decideNet(nav, probe);
  const value = useMemo(() => ({ net, online: net !== 'offline', checkNow: () => void check() }), [net, check]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
export const useOnline = () => useContext(C);
