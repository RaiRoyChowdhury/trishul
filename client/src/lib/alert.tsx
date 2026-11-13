// The alert engine. One place that owns: listening for phrases, shake detection, the countdown,
// cancellation, cooldown and talking to the server. Pages (SOS, No-Touch) just call arm()/trigger().
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { enqueue, listQueue, removeQueue } from './localStore';
import { flushQueue } from './syncQueue';
import { useOnline } from './online';
import { sendSmsFallback, smsAvailable, hasSmsConsent, smsComposeHref, type SmsResult } from './nativeSms';
import { getKv } from './localStore';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { useDemoMode } from './demoMode';
import { useI18n } from './i18n';
import { matchPhrase, phraseStore } from './phrase';
import { ShakeDetector } from './shake';
import { cooldownLeft, canTrigger, secondsLeft, type Source } from './alertRules';
import { createRecognizer, requestMotion, speechRecognitionSupported, motionSupported, type Recognizer } from './speech';
import type { SosEvent } from './types';
import { AlertOverlay } from '../components/AlertOverlay';

export type Mode = 'live' | 'test';
type Phase =
  | { kind: 'idle' }
  | { kind: 'counting'; source: Source; mode: Mode; deadline: number; total: number }
  | { kind: 'sending'; source: Source; mode: Mode }
  | { kind: 'done'; source: Source; mode: Mode; event: SosEvent; note?: string; locIncluded: boolean }
  | { kind: 'queued'; source: Source; id: string; locIncluded: boolean; sms?: SmsResult[]; smsHref?: string }
  | { kind: 'error'; message: string };

interface Ctx {
  phase: Phase; armed: { sos?: Mode; nt?: Mode }; transcript: string; micError: string | null;
  cooldown: number; shakeProgress: number; lastCancel: { followUps: number } | null;
  trigger: (s: Source, m?: Mode) => void; cancel: () => Promise<void>; dismiss: () => void;
  arm: (kind: 'sos' | 'nt', mode: Mode) => Promise<boolean>; disarm: (kind: 'sos' | 'nt') => void;
}
const C = createContext<Ctx>(null as unknown as Ctx);
const CD_KEY = 'trishul.cooldownUntil';
const readCd = () => { try { return Number(localStorage.getItem(CD_KEY) ?? 0); } catch { return 0; } };

export function AlertProvider({ children }: { children: ReactNode }) {
  const { me, session } = useAuth();
  const { err, t } = useI18n(); const { net } = useOnline();
  const judgeDemo = useDemoMode().on; const judgeRef = useRef(judgeDemo); judgeRef.current = judgeDemo;   // Judge Demo Mode: every alert is a TEST alert, nothing is ever sent
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [armed, setArmed] = useState<Ctx['armed']>({});
  const [transcript, setTranscript] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [shakeProgress, setShakeProgress] = useState(0);
  const [lastCancel, setLastCancel] = useState<{ followUps: number } | null>(null);
  const cdUntil = useRef(readCd());
  const eventId = useRef('');
  const timer = useRef<number>(0);
  const rec = useRef<Recognizer | null>(null);
  const armedRef = useRef(armed); armedRef.current = armed;
  const meRef = useRef(me); meRef.current = me;
  const phaseRef = useRef(phase); phaseRef.current = phase;

  // cooldown ticker
  useEffect(() => { const i = window.setInterval(() => setCooldown(cooldownLeft(cdUntil.current, Date.now())), 500); return () => clearInterval(i); }, []);

  const send = useCallback(async (source: Source, mode: Mode) => {
    setPhase({ kind: 'sending', source, mode });
    let loc: { lat: number; lng: number; accuracy?: number } | null = null;
    if (meRef.current?.settings.location_consent && navigator.geolocation) {
      loc = await new Promise(res => navigator.geolocation.getCurrentPosition(
        p => res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), () => res(null), { timeout: 6000, maximumAge: 30000 }));
    }
    try {
      const r = await api.post<{ event: SosEvent; note?: string }>('/sos', { client_event_id: eventId.current, source, mode, location: loc });
      if (mode === 'live' && source !== 'manual') { cdUntil.current = Date.now() + (meRef.current?.settings.nt_cooldown_seconds ?? 120) * 1000; try { localStorage.setItem(CD_KEY, String(cdUntil.current)); } catch { /* ignore */ } }
      setPhase({ kind: 'done', source, mode, event: r.event, note: r.note, locIncluded: !!loc });
    } catch (e) {
      // No connection: a LIVE alert is saved on the phone (encrypted) and sent when back online. It is never shown as sent.
      if (e instanceof ApiError && e.code === 'NETWORK' && mode === 'live') {
        try { await enqueue('sos', { client_event_id: eventId.current, source, mode, location: loc }, eventId.current); window.dispatchEvent(new Event('trishul-queue')); setPhase({ kind: 'queued', source, id: eventId.current, locIncluded: !!loc });
          // Contacts saved on the phone (cached while online). Used for the "SMS my contacts" button (any browser)
          // and for the Android app's automatic SMS. Nothing here is ever reported as delivered.
          const uid = (await supabase?.auth.getSession())?.data.session?.user.id ?? 'anon';
          const cached = await getKv<{ name: string; phone: string | null; consent_confirmed: boolean }[]>(`${uid}:/contacts`).catch(() => null);
          const list = cached?.value ?? [];
          const body = `TRISHUL SOS: I need help.${loc ? ` My location: https://maps.google.com/?q=${loc.lat},${loc.lng}` : ''}`;
          const smsHref = smsComposeHref(list, body);
          if (smsHref) setPhase(p => (p.kind === 'queued' && p.id === eventId.current ? { ...p, smsHref } : p));
          if (smsAvailable() && hasSmsConsent()) {
            const sms = await sendSmsFallback(list, body); setPhase(p => (p.kind === 'queued' && p.id === eventId.current ? { ...p, sms } : p));
          }
          return; } catch { /* storage unavailable: fall through to the error */ }
      }
      setPhase({ kind: 'error', message: e instanceof ApiError && e.code === 'NETWORK' && mode === 'test' ? t('off.testNeedsNet') : err(e) });
    }
  }, [err, t]);

  const trigger = useCallback((source: Source, requested: Mode = 'live') => {
    const mode: Mode = judgeRef.current ? 'test' : requested;
    if (phaseRef.current.kind !== 'idle' || !session) return;               // one alert at a time; must be signed in
    if (!canTrigger(source, mode, cdUntil.current, Date.now())) return;     // cooldown
    const s = meRef.current?.settings;
    const total = mode === 'test' ? 3 : source.startsWith('no_touch') ? (s?.nt_countdown_seconds ?? 10) : (s?.sos_countdown_seconds ?? 10);
    eventId.current = crypto.randomUUID();
    setLastCancel(null);
    setPhase({ kind: 'counting', source, mode, deadline: Date.now() + total * 1000, total });
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
  }, [session]);

  // countdown ticking
  useEffect(() => {
    clearInterval(timer.current);
    if (phase.kind !== 'counting') return;
    const p = phase;
    timer.current = window.setInterval(() => { if (secondsLeft(p.deadline, Date.now()) <= 0) { clearInterval(timer.current); void send(p.source, p.mode); } }, 200);
    return () => clearInterval(timer.current);
  }, [phase, send]);

  // Back online: send saved SOS alerts (the server ignores duplicates by client_event_id). Shown only after the server answers.
  useEffect(() => {
    if (net !== 'online' || !session) return; let dead = false;
    void flushQueue('sos', async it => {
      try { const r = await api.post<{ event: SosEvent; note?: string }>('/sos', it.payload); return { ok: true, result: r }; }
      catch (e) { if (e instanceof ApiError && e.code !== 'NETWORK' && e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 401) return { ok: false, permanent: true, error: e.code }; return { ok: false, permanent: false, error: e instanceof ApiError ? e.code : 'ERR' }; }
    }).then(rep => {
      window.dispatchEvent(new Event('trishul-queue')); const last = rep.sent[rep.sent.length - 1];
      if (!dead && last && phaseRef.current.kind !== 'counting') {
        const r = last.result as { event: SosEvent; note?: string }; const mins = Math.max(1, Math.round((Date.now() - last.item.createdAt) / 60000));
        setPhase({ kind: 'done', source: ((last.item.payload as { source: Source }).source), mode: 'live', event: r.event, note: t('off.sosLate', { m: mins }), locIncluded: !!(last.item.payload as { location: unknown }).location });
      }
    }).catch(() => undefined);
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net, session]);
  void listQueue;

  const dismiss = useCallback(() => setPhase({ kind: 'idle' }), []);
  const cancel = useCallback(async () => {
    const p = phaseRef.current;
    if (p.kind === 'counting') { setPhase({ kind: 'idle' }); return; }          // nothing was created yet
    if (p.kind === 'queued') { await removeQueue(p.id).catch(() => undefined); window.dispatchEvent(new Event('trishul-queue')); setPhase({ kind: 'idle' }); return; }   // never sent: just delete the saved copy
    if (p.kind === 'done' && p.event.status === 'active') {
      try { const r = await api.post<{ followUps: number }>(`/sos/${p.event.id}/cancel`); setLastCancel(r); } catch (e) { setPhase({ kind: 'error', message: err(e) }); return; }
      setPhase({ kind: 'idle' });
    }
  }, [err]);

  // ---- listening for phrases ----
  const stopRec = () => { rec.current?.stop(); rec.current = null; };
  const startRec = useCallback((lang: 'bn' | 'hi' | 'en') => {
    stopRec();
    const u = meRef.current?.profile.id ?? '';
    rec.current = createRecognizer({
      lang, keepAlive: true,
      onText: (text) => {
        setTranscript(text);
        const a = armedRef.current;
        const sosP = phraseStore.get(u, 'sos'), ntP = phraseStore.get(u, 'nt');
        if (a.sos && sosP && matchPhrase(text, sosP).matched) trigger('secret_code', a.sos);
        else if (a.nt && ntP && meRef.current?.settings.nt_voice_enabled && matchPhrase(text, ntP).matched) trigger('no_touch_voice', a.nt);
      },
      onError: (code) => setMicError(code),
    });
    rec.current.start();
  }, [trigger]);

  const arm = useCallback(async (kind: 'sos' | 'nt', requested: Mode) => {
    const mode: Mode = judgeRef.current ? 'test' : requested;
    setMicError(null);
    const s = meRef.current?.settings; if (!s) return false;
    if (kind === 'sos' || s.nt_voice_enabled) {
      if (!speechRecognitionSupported()) { setMicError('unsupported'); if (kind === 'sos') return false; }
      else {
        try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach(t => t.stop()); }   // only to trigger the permission prompt
        catch { setMicError('not-allowed'); if (kind === 'sos') return false; }
      }
    }
    setArmed(a => { const n = { ...a, [kind]: mode }; armedRef.current = n; return n; });
    const lang = (kind === 'sos' ? s.sos_phrase_lang : s.nt_phrase_lang) ?? 'bn';
    if (speechRecognitionSupported() && (kind === 'sos' || s.nt_voice_enabled)) startRec(lang);
    return true;
  }, [startRec]);
  const disarm = useCallback((kind: 'sos' | 'nt') => {
    setArmed(a => { const n = { ...a }; delete n[kind]; armedRef.current = n; if (!n.sos && !(n.nt && meRef.current?.settings.nt_voice_enabled)) stopRec(); return n; });
    setTranscript('');
  }, []);

  // ---- shake (No-Touch) ----
  useEffect(() => {
    if (!armed.nt || !me?.settings.nt_shake_enabled || !motionSupported()) return;
    let on = true; let handler: ((e: DeviceMotionEvent) => void) | null = null;
    const det = new ShakeDetector(me.settings.nt_shake_sensitivity, () => trigger('no_touch_shake', armedRef.current.nt ?? 'live'), 4, 1800, 120, setShakeProgress);
    void requestMotion().then(ok => {
      if (!ok || !on) return;
      handler = (e) => { const a = e.accelerationIncludingGravity; det.push(a?.x ?? null, a?.y ?? null, a?.z ?? null, Date.now()); };
      window.addEventListener('devicemotion', handler);
    });
    return () => { on = false; if (handler) window.removeEventListener('devicemotion', handler); };
  }, [armed.nt, me?.settings.nt_shake_enabled, me?.settings.nt_shake_sensitivity, trigger]);

  // Immediate disable: if No-Touch is turned off in settings, stop listening.
  useEffect(() => { if (me && !me.settings.nt_enabled && armed.nt) disarm('nt'); }, [me, armed.nt, disarm]);
  // Accessible shortcut: Alt+Shift+S
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.altKey && e.shiftKey && e.code === 'KeyS') trigger('manual', 'live'); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [trigger]);
  // Sign-out clears everything.
  useEffect(() => { if (!session) { stopRec(); setArmed({}); setPhase({ kind: 'idle' }); } }, [session]);
  useEffect(() => () => stopRec(), []);

  const value = useMemo(() => ({ phase, armed, transcript, micError, cooldown, shakeProgress, lastCancel, trigger, cancel, dismiss, arm, disarm }),
    [phase, armed, transcript, micError, cooldown, shakeProgress, lastCancel, trigger, cancel, dismiss, arm, disarm]);
  return <C.Provider value={value}>{children}<AlertOverlay /></C.Provider>;
}
export const useAlert = () => useContext(C);
