import { useEffect, useRef, useState } from 'react';
import { Hand, Power } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useAlert } from '../lib/alert';
import { useSaveSettings } from '../lib/settings';
import { ShakeDetector } from '../lib/shake';
import { motionSupported, requestMotion, speechRecognitionSupported } from '../lib/speech';
import { Badge, Notice, PageTitle, Toggle } from '../components/ui';
import { PhraseEditor } from '../components/PhraseEditor';
import { phraseStore } from '../lib/phrase';
import { RecentAlerts } from './SosPage';
import type { Key } from '../locales';

function Cap({ ok, label, why }: { ok: boolean; label: string; why?: string }) {
  const { t } = useI18n();
  return <li className="flex items-start justify-between gap-2 py-2 text-sm"><div><div className="font-semibold">{label}</div>{!ok && why && <div className="text-xs text-charcoal/70">{why}</div>}</div><Badge tone={ok ? 'ok' : 'gray'}>{t(ok ? 'nt.ok' : 'nt.no')}</Badge></li>;
}

export default function NoTouch() {
  const { me } = useAuth(); const { t } = useI18n(); const a = useAlert(); const save = useSaveSettings();
  const [shakeTest, setShakeTest] = useState(false); const [progress, setProgress] = useState(0); const [detected, setDetected] = useState(0);
  const [motionMsg, setMotionMsg] = useState<string | null>(null);
  const handler = useRef<((e: DeviceMotionEvent) => void) | null>(null);
  const sens = me?.settings.nt_shake_sensitivity ?? 3;

  // Local shake test: counts shakes on screen only, sends nothing.
  useEffect(() => {
    if (!shakeTest) return;
    const det = new ShakeDetector(sens, () => setDetected(n => n + 1), 4, 1800, 120, setProgress);
    handler.current = (e) => { const g = e.accelerationIncludingGravity; det.push(g?.x ?? null, g?.y ?? null, g?.z ?? null, Date.now()); };
    window.addEventListener('devicemotion', handler.current);
    return () => { if (handler.current) window.removeEventListener('devicemotion', handler.current); };
  }, [shakeTest, sens]);

  if (!me) return null;
  const s = me.settings, uid = me.profile.id;
  const srOk = speechRecognitionSupported(), motionOk = motionSupported() && window.isSecureContext;
  const startShakeTest = async () => { setMotionMsg(null); if (await requestMotion()) { setDetected(0); setShakeTest(true); } else setMotionMsg(t('nt.motionDenied')); };
  const hasPhrase = !!phraseStore.get(uid, 'nt');
  const armed = a.armed.nt;

  return (
    <div className="space-y-4">
      <PageTitle title={t('nt.title')} sub={t('nt.intro')} />
      <div className="flex items-start gap-3 rounded-2xl border border-gold/60 bg-gradient-to-r from-gold/25 to-champagne p-4 shadow-sm" role="note">
        <span className="icon-chip"><Hand className="h-5 w-5" aria-hidden /></span>
        <div><div className="chip mb-1 !border-crimson/30 !bg-crimson !text-ivory">{t('call.demoMode')}</div><h2 className="font-display text-lg text-crimson">{t('nt.demoTitle')}</h2><p className="text-sm text-charcoal/80">{t('nt.demoBody')}</p></div>
      </div>
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <Toggle label={t('nt.enable')} checked={s.nt_enabled} onChange={v => void save({ nt_enabled: v })} />
        {s.nt_enabled && <button className="btn-danger" onClick={() => void save({ nt_enabled: false })}><Power className="h-4 w-4" />{t('nt.disableNow')}</button>}
      </div>
      <section className="card"><h2 className="font-display text-lg text-crimson">{t('nt.methods')}</h2>
        <ul className="divide-y divide-gold/30"><Cap ok={srOk} label={t('nt.m.voice')} why={t('nt.why.sr')} />
          <Cap ok={motionOk} label={t('nt.m.shake')} why={motionSupported() ? t('nt.why.https') : t('nt.why.motion')} />
          <Cap ok label={t('nt.m.accessible')} /></ul>
        <p className="mt-2 text-sm">{t('nt.accessibleBody')}</p></section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-3"><Toggle label={t('nt.m.voice')} checked={s.nt_voice_enabled} onChange={v => void save({ nt_voice_enabled: v })} disabled={!srOk} />
          {s.nt_voice_enabled && <PhraseEditor kind="nt" />}</section>
        <section className="card space-y-3"><Toggle label={t('nt.shake')} checked={s.nt_shake_enabled} onChange={v => void save({ nt_shake_enabled: v })} disabled={!motionOk} />
          <label className="label" htmlFor="sens">{t('nt.sens')}: {t('nt.low')} ← {s.nt_shake_sensitivity} → {t('nt.high')}</label>
          <input id="sens" type="range" min={1} max={5} value={s.nt_shake_sensitivity} className="w-full accent-crimson" onChange={e => void save({ nt_shake_sensitivity: Number(e.target.value) })} />
          <p className="text-xs text-charcoal/70">{t('nt.shakeHow', { n: 4 })}</p>
          {!shakeTest ? <button className="btn-secondary" disabled={!motionOk} onClick={() => void startShakeTest()}><Hand className="h-4 w-4" />{t('nt.testShake')}</button>
            : <div className="rounded-xl bg-champagne p-3 text-sm" aria-live="polite"><b>{t('nt.testMode')}</b><div>{t('nt.shakes')}: {detected} <span className="text-xs">({progress}/4)</span></div><button className="btn-ghost mt-1" onClick={() => setShakeTest(false)}>{t('common.stop')}</button></div>}
          {motionMsg && <Notice tone="error">{motionMsg}</Notice>}</section>
      </div>

      <section className="card space-y-3">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="ntc">{t('sos.countdownLen')}: {s.nt_countdown_seconds}</label><input id="ntc" type="range" min={5} max={30} value={s.nt_countdown_seconds} className="w-full accent-crimson" onChange={e => void save({ nt_countdown_seconds: Number(e.target.value) })} /></div>
          <div><label className="label" htmlFor="ntd">{t('nt.cooldown')}: {s.nt_cooldown_seconds}</label><input id="ntd" type="range" min={30} max={900} step={30} value={s.nt_cooldown_seconds} className="w-full accent-crimson" onChange={e => void save({ nt_cooldown_seconds: Number(e.target.value) })} /></div></div>
        {a.cooldown > 0 && <Notice>{t('nt.cooling', { n: a.cooldown })}</Notice>}
        <p className="text-sm">{t('nt.shared')}</p>
        {a.micError && <Notice tone="error">{t('call.noMic')} ({a.micError})</Notice>}
        <div className="flex flex-wrap gap-2">
          {!armed ? <>
            <button className="btn-secondary" disabled={!s.nt_enabled || (!hasPhrase && !motionOk)} onClick={() => void a.arm('nt', 'test')}>{t('nt.testMode')}</button>
            <button className="btn-primary" disabled={!s.nt_enabled || (!hasPhrase && !motionOk)} onClick={() => void a.arm('nt', 'live')}>{t('nt.arm')}</button></>
            : <button className="btn-danger" onClick={() => a.disarm('nt')}>{t('nt.disarm')}</button>}
        </div>
        {!s.nt_enabled && <p className="text-sm text-charcoal/70">{t('common.off')}</p>}
        {armed && <div className="rounded-xl bg-champagne p-3 text-sm" aria-live="polite"><b>{t('nt.armed')}</b> <Badge tone={armed === 'test' ? 'gray' : 'red'}>{t(`sos.mode.${armed}` as Key)}</Badge>
          {s.nt_voice_enabled && <div>{t('sos.heard')}: <i>{a.transcript || '…'}</i></div>}{s.nt_shake_enabled && <div>{t('nt.shakes')}: {a.shakeProgress}/4</div>}</div>}
      </section>
      <Notice tone="warn">{t('nt.background')}</Notice>
      <RecentAlerts refreshKey={a.phase.kind} />
    </div>
  );
}
