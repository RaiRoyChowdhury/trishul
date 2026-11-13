import { useDemoMode } from '../lib/demoMode';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneCall, PhoneOff, Send, Zap, Disc3, Bot, UserPlus, CheckCircle2, FlaskConical } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useSaveSettings } from '../lib/settings';
import { useOnline } from '../lib/online';
import { toWav } from '../lib/wav';
import { createRecognizer, speakDevice, speechRecognitionSupported, type Recognizer } from '../lib/speech';
import { clipAt, clipUrl, demoCaller, loadDemoVoices, type DemoVoice } from '../lib/demo';
import { CallerManager } from '../components/CallerManager';
import { Notice, PageTitle } from '../components/ui';
import type { Caller } from '../lib/types';
import type { Key } from '../locales';

type Turn = { role: 'user' | 'assistant'; content: string };
const SCEN: Record<string, string> = {
  auto: 'The user is alone in an auto-rickshaw in Kolkata and feels uncomfortable with the driver.', taxi: 'The user is alone in a taxi or cab in Kolkata at night.',
  walking: 'The user is walking alone on a street in Kolkata in the evening.', waiting: 'The user is waiting alone for transport at a stop in Kolkata.',
};
const DemoBanner = ({ text, sub }: { text: string; sub?: string }) => (
  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gold bg-gradient-to-r from-gold/30 to-champagne px-3 py-2 text-sm font-semibold text-crimson shadow-sm" role="status">
    <FlaskConical className="h-4 w-4 shrink-0" aria-hidden /><span className="min-w-0">{text}</span>{sub && <span className="chip ml-auto shrink-0 !bg-crimson !text-ivory">{sub}</span>}
  </div>);
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function FakeCall() {
  const { me } = useAuth(); const { t, err, lang } = useI18n(); const save = useSaveSettings();
  const [callers, setCallers] = useState<Caller[]>([]);
  const [sel, setSel] = useState<Caller | null>(null);
  const [scenario, setScenario] = useState('auto');
  const [stage, setStage] = useState<'setup' | 'ringing' | 'call'>('setup');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [secs, setSecs] = useState(0); const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [error, setError] = useState<{ text: string; offerDevice: boolean } | null>(null);
  const [text, setText] = useState('');
  const [demoVoices, setDemoVoices] = useState<DemoVoice[]>([]); const [demo, setDemo] = useState<DemoVoice | null>(null); const demoN = useRef(0);
  useEffect(() => { void loadDemoVoices().then(setDemoVoices); }, []);
  // Live AI is allowed only inside the admin-activated 30-day window and while the shared Rs 20 budget lasts. Otherwise: scripted demo only.
  const [ai, setAi] = useState<{ mode: 'live' | 'demo'; reason: string; expires_at: string | null } | null>(null);
  useEffect(() => { api.get<NonNullable<typeof ai>>('/ai/status').then(setAi).catch(e => setAi({ mode: 'demo', reason: e instanceof ApiError && e.code === 'NETWORK' ? 'offline' : 'no_key', expires_at: null })); }, []);
  const { online } = useOnline();
  const judgeDemo = useDemoMode().on;
  const aiDemo = ai?.mode !== 'live' || !online || judgeDemo;   // Judge Demo Mode never calls the AI   // offline always means prepared recordings only, never AI
  const aiShown = !online ? { mode: 'demo' as const, reason: 'offline', expires_at: null } : ai;
  const preferred = demoVoices.find(v => v.language === lang) ?? demoVoices[0];
  const micRec = useRef<MediaRecorder | null>(null);
  const rec = useRef<Recognizer | null>(null); const audio = useRef<HTMLAudioElement | null>(null); const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = turns;
  const engine = me?.settings.voice_engine ?? 'cloud';

  useEffect(() => { if (stage !== 'call') return; const i = setInterval(() => setSecs(s => s + 1), 1000); return () => clearInterval(i); }, [stage]);
  useEffect(() => { if (stage !== 'ringing') return; const i = setInterval(() => { try { navigator.vibrate?.(300); } catch { /* none */ } }, 1500); return () => clearInterval(i); }, [stage]);
  const cleanup = () => { rec.current?.stop(); audio.current?.pause(); try { speechSynthesis.cancel(); } catch { /* none */ } };
  useEffect(() => cleanup, []);

  const speak = useCallback(async (reply: string, c: Caller, useDevice = engine === 'device') => {
    setStatus('speaking');
    try {
      if (useDevice) await speakDevice(reply, c.language);
      else { const blob = await api.blob('/call/tts', { text: reply, callerId: c.id }); const a = new Audio(URL.createObjectURL(blob)); audio.current = a; await a.play(); await new Promise(r => { a.onended = r; a.onerror = r; }); }
    } catch (e) {
      const needsCfg = e instanceof ApiError && ['VOICE_NOT_CONFIGURED', 'AI_DEMO_MODE', 'AI_UNAVAILABLE', 'TTS_FAILED', 'TTS_UNAVAILABLE', 'NO_VOICE'].includes(e.code);
      setError({ text: e instanceof ApiError ? err(e) : t('call.ttsFail'), offerDevice: needsCfg });
    } finally { setStatus('idle'); }
  }, [engine, err, t]);

  const playDemo = useCallback(async (v: DemoVoice) => {
    const clip = clipAt(v, demoN.current); demoN.current += 1; setError(null);
    setTurns(h => [...h, { role: 'assistant', content: clip.text }]); setStatus('speaking');
    try { const a = new Audio(clipUrl(clip.file)); audio.current = a; await a.play(); await new Promise(r => { a.onended = r; a.onerror = r; }); }
    catch {
      // Recording missing: read the prepared script with the phone's own voice, and say so. It is still not AI.
      try { setError({ text: t('off.deviceVoice'), offerDevice: false }); await speakDevice(clip.text, v.language); } catch { setError({ text: t('call.demoMissing'), offerDevice: false }); }
    }
    finally { setStatus('idle'); }
  }, [t]);

  const ask = useCallback(async (c: Caller, history: Turn[]) => {
    setStatus('thinking'); setError(null);
    try {
      const r = await api.post<{ text: string }>('/call/reply', { callerId: c.id, scenario: SCEN[scenario], messages: [{ role: 'user', content: '[The call just connected. You speak first, as the caller.]' }, ...history] });
      setTurns(h => [...h, { role: 'assistant', content: r.text }]);
      await speak(r.text, c);
    } catch (e) {
      if (e instanceof ApiError && ['AI_DEMO_MODE', 'AI_UNAVAILABLE', 'NETWORK'].includes(e.code)) { setAi({ mode: 'demo', reason: e.code === 'AI_DEMO_MODE' ? 'not_activated' : e.code === 'NETWORK' ? 'offline' : 'budget_exhausted', expires_at: null }); if (demoVoices[0]) { setDemo(demoVoices[0]); demoN.current = 0; } }
      setError({ text: err(e), offerDevice: false }); setStatus('idle');
    }
  }, [err, scenario, speak, demoVoices]);

  const say = async (content: string) => {
    if (!sel || !content.trim() || status === 'thinking' || status === 'speaking') return;
    if (demo) { setTurns(h => [...h, { role: 'user', content: content.trim() }]); setText(''); await playDemo(demo); return; }
    const h = [...turnsRef.current, { role: 'user' as const, content: content.trim() }];
    setTurns(h); setText(''); await ask(sel, h);
  };
  const listenSarvam = async () => {
    if (!sel) return; setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const chunks: Blob[] = [];
      const mr = new MediaRecorder(stream); micRec.current = mr; mr.ondataavailable = e => chunks.push(e.data);
      const stop = window.setTimeout(() => { if (mr.state === 'recording') mr.stop(); }, 12000);
      mr.onstop = async () => {
        clearTimeout(stop); stream.getTracks().forEach(x => x.stop()); micRec.current = null; setStatus('thinking');
        try { const { wav } = await toWav(new Blob(chunks, { type: mr.mimeType })); const r = await api.upload<{ text: string }>('/call/stt', wav); setStatus('idle'); if (r.text) await say(r.text); else setError({ text: t('ai.sttFail'), offerDevice: false }); }
        catch (e) { setStatus('idle'); setError({ text: e instanceof ApiError ? err(e) : t('ai.sttFail'), offerDevice: false }); }
      };
      setStatus('listening'); mr.start();
    } catch { setError({ text: t('call.noMic'), offerDevice: false }); setStatus('idle'); }
  };
  const listen = () => {
    if (!sel || muted) return; setError(null);
    if (!demo && !aiDemo) { void listenSarvam(); return; }
    if (!speechRecognitionSupported()) { setError({ text: t('call.noSpeech'), offerDevice: false }); return; }
    let finalText = '';
    rec.current = createRecognizer({ lang: sel.language, onText: (x, fin) => { if (fin) finalText = x; }, onError: () => { setError({ text: t('call.noMic'), offerDevice: false }); setStatus('idle'); }, onEnd: () => { setStatus(s => (s === 'listening' ? 'idle' : s)); if (finalText) void say(finalText); } });
    setStatus('listening'); rec.current.start();
  };
  const begin = (c: Caller) => { setDemo(null); demoN.current = 0; setSel(c); setTurns([]); setSecs(0); setError(null); setStage('ringing'); };
  const accept = () => { setStage('call'); if (demo) void playDemo(demo); else if (sel) void ask(sel, []); };
  const beginDemo = (v: DemoVoice) => { setSel(demoCaller(v)); setDemo(v); demoN.current = 0; setTurns([]); setSecs(0); setError(null); setStage('ringing'); };
  const end = () => { cleanup(); setStage('setup'); setStatus('idle'); };
  const personalRef = useRef<HTMLDivElement | null>(null); const [needCallerHint, setNeedCallerHint] = useState(false);
  const usingDefault = !!sel && !demo && !sel.voice_id; const usingPersonal = !!sel && !demo && !!sel.voice_id;
  const goPersonal = () => { personalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); personalRef.current?.focus({ preventScroll: true }); };
  const useDefaultVoice = () => { const c = callers.find(x => !x.voice_id); if (c) { setSel(c); setNeedCallerHint(false); } else { setNeedCallerHint(true); goPersonal(); } };
  const quick = () => { const c = sel ?? callers[0]; if (c) { setScenario(scenario); begin(c); } };

  if (stage === 'ringing' && sel) return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-between gap-5 rounded-3xl bg-gradient-to-b from-crimson-light via-crimson to-crimson-dark p-6 text-center text-ivory shadow-lift animate-pop-in">
      <div className="w-full text-left"><span className="chip !bg-gold !text-crimson-dark"><FlaskConical className="h-3.5 w-3.5" aria-hidden />{t('call.demoMode')}</span></div>
      <div><p className="text-sm opacity-80">{t('call.incoming')}</p><div className="mx-auto mt-6 grid h-28 w-28 animate-ring-pulse place-items-center rounded-full bg-ivory/15 font-display text-5xl ring-4 ring-gold">{sel.name.slice(0, 1)}</div>
        <h1 className="mt-4 font-display text-3xl">{sel.name}</h1><p className="opacity-80">{sel.relationship}</p></div>
      <p className="rounded-xl bg-crimson-dark/60 p-3 text-xs">{t('call.disclosure')}</p>
      <div className="flex w-full justify-around"><button onClick={end} className="grid h-16 w-16 place-items-center rounded-full bg-vermilion" aria-label={t('call.decline')}><PhoneOff /></button>
        <button onClick={accept} className="grid h-16 w-16 place-items-center rounded-full bg-ok" aria-label={t('call.accept')} autoFocus><PhoneCall /></button></div>
    </div>);

  if (stage === 'call' && sel) return (
    <div className="mx-auto flex max-w-lg flex-col gap-3">
      <DemoBanner text={t('call.demoBanner')} sub={demo ? t('call.demoScripted') : undefined} />
      <div className="rounded-3xl bg-gradient-to-b from-crimson-light to-crimson-dark p-5 text-center text-ivory shadow-lift"><p className="text-xs opacity-80">{t('call.connected')} · {fmt(secs)}</p><h1 className="font-display text-2xl">{sel.name}</h1><p className="text-sm opacity-80">{sel.relationship}</p>
        <p className="mt-1 text-sm" aria-live="polite">{status === 'thinking' ? t('call.thinking') : status === 'listening' ? t('call.listening') : status === 'speaking' ? '🔊' : ''}</p></div>
      <p className="rounded-xl bg-champagne p-2 text-center text-xs">{t('call.disclosure')}{demo ? ` · ${t('call.demoBadge')}` : ''}</p>
      {turns.length > 0 && <ul className="card max-h-[38vh] space-y-2 overflow-y-auto" aria-live="polite">{turns.map((x, i) => <li key={i} className={`max-w-[85%] animate-fade-up rounded-2xl px-3.5 py-2 text-[0.95rem] shadow-sm ${x.role === 'assistant' ? 'rounded-bl-sm bg-champagne' : 'ml-auto rounded-br-sm bg-crimson text-ivory'}`}><span className="block text-[10px] opacity-70">{x.role === 'assistant' ? sel.name : t('call.you')}</span>{x.content}</li>)}</ul>}
      {error && <Notice tone="error">{error.text}{error.offerDevice && <button className="btn-secondary mt-2 w-full" onClick={() => { void save({ voice_engine: 'device' }); const last = turns[turns.length - 1]; if (last?.role === 'assistant') void speak(last.content, sel, true); setError(null); }}>{t('call.useDevice')}</button>}</Notice>}
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void say(text); }}>
        <input className="input" value={text} onChange={e => setText(e.target.value)} placeholder={t('call.type')} maxLength={300} /><button className="btn-primary" aria-label={t('common.send')} disabled={!text.trim() || status === 'thinking'}><Send className="h-5 w-5" /></button></form>
      <div className="flex justify-around py-2">
        <button onClick={() => { setMuted(m => !m); rec.current?.stop(); }} className={`grid h-14 w-14 place-items-center rounded-full ${muted ? 'bg-charcoal text-ivory' : 'bg-champagne text-crimson'}`} aria-label={t(muted ? 'call.unmute' : 'call.mute')} aria-pressed={muted}>{muted ? <MicOff /> : <Mic />}</button>
        <button onClick={() => (micRec.current?.state === 'recording' ? micRec.current.stop() : listen())} disabled={muted || (status !== 'idle' && status !== 'listening')} className="btn-secondary !rounded-full px-6"><Mic className="h-5 w-5" />{status === 'listening' && micRec.current ? t('ai.stop') : t('call.speak')}</button>
        <button onClick={end} className="grid h-14 w-14 place-items-center rounded-full bg-vermilion text-white" aria-label={t('call.end')}><PhoneOff /></button></div>
    </div>);

  return (
    <div className="space-y-4">
      <PageTitle title={t('call.title')} sub={t('call.intro')} />
      <DemoBanner text={t('call.demoBanner')} />
      {aiShown && (aiDemo
        ? <Notice tone="warn" title={t('ai.title')}><p>{t('ai.demoOn')}</p><p className="text-xs">{t(`ai.reason.${aiShown.reason}` as Key)} {t('ai.demoScriptNote')}</p></Notice>
        : <Notice tone="ok">{t('ai.live', { date: aiShown.expires_at ? new Date(aiShown.expires_at).toLocaleDateString() : '' })}</Notice>)}
      <Notice>{t('call.disclosure')}</Notice>

      <section aria-label={t('call.voiceTitle')} className="space-y-2">
        <h2 className="font-display text-lg text-crimson">{t('call.voiceTitle')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <article className={`card card-link flex flex-col gap-3 ${usingDefault ? '!border-crimson ring-2 ring-crimson/70' : ''}`}>
            <div className="flex items-start gap-3"><span className="icon-chip"><Bot className="h-5 w-5" aria-hidden /></span>
              <div className="min-w-0"><h3 className="font-display text-lg leading-snug text-crimson">{t('call.defVoice')}</h3><p className="text-sm text-charcoal/75">{t('call.defVoiceSub')}</p></div>
              <span className="chip ml-auto shrink-0 !bg-gold/30 text-crimson">{t('call.defBadge')}</span></div>
            {needCallerHint && <p className="rounded-xl bg-champagne p-2 text-xs text-charcoal/80" role="status">{t('call.defNeedCaller')}</p>}
            <button className={usingDefault ? 'btn-primary mt-auto' : 'btn-secondary mt-auto'} onClick={useDefaultVoice} aria-pressed={usingDefault}>
              {usingDefault ? <><CheckCircle2 className="h-5 w-5" />{t('call.selected')}</> : t('call.useDefault')}</button>
          </article>
          <article className={`card card-link flex flex-col gap-3 ${usingPersonal ? '!border-crimson ring-2 ring-crimson/70' : ''}`}>
            <div className="flex items-start gap-3"><span className="icon-chip"><UserPlus className="h-5 w-5" aria-hidden /></span>
              <div className="min-w-0"><h3 className="font-display text-lg leading-snug text-crimson">{t('call.persTitle')}</h3><p className="text-sm text-charcoal/75">{t('call.persSub')}</p></div></div>
            <button className="btn-secondary mt-auto" onClick={goPersonal}>{usingPersonal ? <CheckCircle2 className="h-5 w-5" /> : null}{t('call.persBtn')}</button>
          </article>
        </div>
      </section>

      <div id="personal-voice" ref={personalRef} tabIndex={-1} className="scroll-mt-20 space-y-2 outline-none">
        <h2 className="font-display text-lg text-crimson">{t('call.callers')}</h2>
        <CallerManager selected={sel?.id} onSelect={setSel} onLoaded={l => { setCallers(l); if (!sel && l[0]) setSel(l[0]); }} />
      </div>
      <section className="card space-y-3">
        <label className="label" htmlFor="sc">{t('call.scenario')}</label>
        <select id="sc" className="input" value={scenario} onChange={e => setScenario(e.target.value)}>{(['auto', 'taxi', 'walking', 'waiting'] as const).map(k => <option key={k} value={k}>{t(`call.sc.${k}` as Key)}</option>)}</select>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={aiDemo ? !demoVoices.length : !sel} onClick={() => (aiDemo && preferred ? beginDemo(preferred) : sel && begin(sel))}><PhoneCall className="h-5 w-5" />{t('call.start')}{aiDemo && preferred ? ` — ${preferred.name}` : sel ? ` — ${sel.name}` : ''}</button>
          <button className="btn-secondary" disabled={aiDemo || !callers.length} onClick={quick}><Zap className="h-5 w-5" />{t('call.quick')}</button></div>
        {demoVoices.length > 0 && <div className="border-t border-gold/40 pt-3"><p className="label">{t('call.demo')}</p><p className="mb-2 text-xs text-charcoal/70">{t('call.demoNote')}</p>
          <div className="flex flex-wrap gap-2">{demoVoices.map(v => <button key={v.id} className="btn-secondary" onClick={() => beginDemo(v)}><Disc3 className="h-5 w-5" />{v.name}</button>)}</div></div>}
        <p className="text-xs text-charcoal/70">{engine === 'device' ? t('call.deviceVoiceNote') : t('set.cloud')}</p>
      </section>
    </div>
  );
}
