import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Upload, Wand2 } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { MAX_SAMPLE_SECONDS, MIN_SAMPLE_SECONDS, toWav } from '../lib/wav';
import type { Lang } from '../locales';
import { Notice } from './ui';

/** Record or upload a short sample, confirm consent, and create a cloned voice. Calls onCloned(voiceId). */
export function VoiceCloner({ name, language, onCloned }: { name: string; language: Lang; onCloned: (voiceId: string) => void }) {
  const { t, err } = useI18n();
  const [sample, setSample] = useState<{ wav: Blob; seconds: number; url: string } | null>(null);
  const [recording, setRecording] = useState(false); const [elapsed, setElapsed] = useState(0);
  const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const recRef = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]); const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => { window.clearInterval(timer.current); recRef.current?.stream.getTracks().forEach(x => x.stop()); }, []);

  const accept = async (blob: Blob) => {
    setMsg(null);
    try {
      const { wav, seconds } = await toWav(blob);
      if (seconds < MIN_SAMPLE_SECONDS) { setSample(null); setMsg({ tone: 'error', text: t('vc.tooShort', { n: MIN_SAMPLE_SECONDS }) }); return; }
      setSample(s => { if (s) URL.revokeObjectURL(s.url); return { wav, seconds, url: URL.createObjectURL(wav) }; });
    } catch { setMsg({ tone: 'error', text: t('vc.unreadable') }); }
  };
  const start = async () => {
    setMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream); recRef.current = rec; chunks.current = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => { stream.getTracks().forEach(x => x.stop()); window.clearInterval(timer.current); setRecording(false); void accept(new Blob(chunks.current, { type: rec.mimeType })); };
      rec.start(); setRecording(true); setElapsed(0);
      timer.current = window.setInterval(() => setElapsed(e => { if (e + 1 >= MAX_SAMPLE_SECONDS) rec.state === 'recording' && rec.stop(); return e + 1; }), 1000);
    } catch { setMsg({ tone: 'error', text: t('call.noMic') }); }
  };
  const create = async () => {
    if (!sample || !consent || !name.trim()) return; setBusy(true); setMsg(null);
    try {
      const q = new URLSearchParams({ name: name.trim().slice(0, 100), language, consent: '1' });
      const r = await api.upload<{ voice_id: string }>(`/voices/clone-sample?${q}`, sample.wav);
      onCloned(r.voice_id); setSample(null); setConsent(false); setMsg({ tone: 'ok', text: t('vc.done') });
    } catch (e) { setMsg({ tone: 'error', text: err(e) }); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-gold/60 bg-gradient-to-b from-white to-champagne p-4">
      <div className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-crimson" aria-hidden /><h3 className="font-display text-lg text-crimson">{t('vc.title')}</h3></div>
      <p className="text-sm text-charcoal/80">{t('vc.help', { a: MIN_SAMPLE_SECONDS, b: MAX_SAMPLE_SECONDS })}</p>
      <div className="flex flex-wrap gap-2">
        {!recording ? <button type="button" className="btn-secondary" onClick={() => void start()}><Mic className="h-5 w-5" />{t('vc.record')}</button>
          : <button type="button" className="btn-danger" onClick={() => recRef.current?.stop()}><Square className="h-5 w-5" />{t('vc.stop')} · {elapsed}s</button>}
        <label className="btn-secondary cursor-pointer"><Upload className="h-5 w-5" />{t('vc.upload')}
          <input type="file" accept="audio/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) void accept(f); e.target.value = ''; }} /></label>
      </div>
      {sample && <div className="space-y-1"><p className="text-xs text-charcoal/70">{t('vc.ready', { n: Math.round(sample.seconds) })}</p><audio controls src={sample.url} className="w-full" /></div>}
      <label className="flex items-start gap-3 rounded-xl bg-white/70 p-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5" checked={consent} onChange={e => setConsent(e.target.checked)} />{t('vc.consent')}</label>
      {!name.trim() && <p className="text-xs text-vermilion">{t('vc.needName')}</p>}
      <button type="button" className="btn-primary w-full" disabled={!sample || !consent || !name.trim() || busy} onClick={() => void create()}>{busy ? t('vc.creating') : t('vc.create')}</button>
      {msg && <Notice tone={msg.tone === 'ok' ? 'ok' : 'error'}>{msg.text}</Notice>}
    </div>
  );
}
