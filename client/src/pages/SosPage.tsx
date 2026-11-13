import { useEffect, useState } from 'react';
import { Mic, MicOff, ShieldAlert } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useAlert } from '../lib/alert';
import { api } from '../lib/api';
import { matchPhrase, phraseStore } from '../lib/phrase';
import { speechRecognitionSupported } from '../lib/speech';
import { useSaveSettings } from '../lib/settings';
import { Badge, Notice, PageTitle } from '../components/ui';
import { PhraseEditor } from '../components/PhraseEditor';
import type { SosEvent } from '../lib/types';
import type { Key } from '../locales';

export function RecentAlerts({ refreshKey }: { refreshKey: unknown }) {
  const { t, lang } = useI18n(); const [list, setList] = useState<SosEvent[]>([]);
  useEffect(() => { api.get<SosEvent[]>('/sos').then(setList).catch(() => setList([])); }, [refreshKey]);
  if (!list.length) return null;
  return (
    <section className="card"><h2 className="mb-2 font-display text-lg text-crimson">{t('sos.recent')}</h2>
      <ul className="divide-y divide-gold/30 text-sm">{list.slice(0, 6).map(e => (
        <li key={e.id} className="py-2"><div className="flex flex-wrap items-center gap-2"><Badge tone={e.mode === 'live' ? 'red' : 'gray'}>{t(`sos.mode.${e.mode}` as Key)}</Badge><span>{t(`sos.src.${e.source}` as Key)}</span><span className="text-xs text-charcoal/70">{new Date(e.triggered_at).toLocaleString(lang === 'en' ? 'en-IN' : lang === 'hi' ? 'hi-IN' : 'bn-IN')}</span>{e.status === 'cancelled' && <Badge tone="gray">{t('walk.st.cancelled')}</Badge>}</div>
          {e.notification_attempts?.map((a, i) => <div key={i} className="ml-2 text-xs text-charcoal/80">{a.contact_name} · {a.channel} · {t(`sos.st.${a.status}` as Key)}</div>)}</li>))}</ul></section>
  );
}

export default function SosPage() {
  const { me } = useAuth(); const { t } = useI18n(); const a = useAlert(); const save = useSaveSettings();
  const [contacts, setContacts] = useState<number | null>(null);
  useEffect(() => { api.get<unknown[]>('/contacts').then(c => setContacts(c.length)).catch(() => setContacts(null)); }, []);
  if (!me) return null;
  const s = me.settings, uid = me.profile.id;
  const phrase = phraseStore.get(uid, 'sos');
  const mode = a.armed.sos;
  const heardMatch = mode && phrase && a.transcript ? matchPhrase(a.transcript, phrase).matched : false;
  const canArm = !!phrase && speechRecognitionSupported();

  return (
    <div className="space-y-4">
      <PageTitle title={t('sos.title')} sub={t('sos.intro')} />
      {!s.sos_enabled && <Notice tone="warn">{t('common.off')}: {t('nav.sos')}</Notice>}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card"><PhraseEditor kind="sos" /></section>
        <section className="card space-y-3">
          <h2 className="font-display text-lg text-crimson">{t('sos.test')}</h2>
          <p className="text-sm">{t('sos.testHint')}</p>
          <p className="text-xs text-charcoal/70">{t('sos.micWhy')}</p>
          {!speechRecognitionSupported() && <Notice tone="warn">{t('nt.why.sr')}</Notice>}
          {a.micError && <Notice tone="error">{t('call.noMic')} ({a.micError})</Notice>}
          <div className="flex flex-wrap gap-2">
            {!mode
              ? <><button className="btn-secondary" disabled={!canArm} onClick={() => void a.arm('sos', 'test')}><Mic className="h-5 w-5" />{t('sos.test')}</button>
                  <button className="btn-primary" disabled={!canArm || !s.sos_enabled || contacts === 0} onClick={() => void a.arm('sos', 'live')}><Mic className="h-5 w-5" />{t('sos.listen')}</button></>
              : <button className="btn-danger" onClick={() => a.disarm('sos')}><MicOff className="h-5 w-5" />{t('sos.stopListen')}</button>}
          </div>
          {!phrase && <p className="text-sm text-vermilion">{t('sos.noPhrase')}</p>}
          {contacts === 0 && <p className="text-sm text-vermilion">{t('sos.needContacts')}</p>}
          {mode && (<div className="rounded-xl bg-champagne p-3 text-sm" aria-live="polite">
            <div className="flex items-center gap-2"><span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-vermilion opacity-60" /><span className="relative inline-flex h-3 w-3 rounded-full bg-vermilion" /></span><b>{t('sos.listeningNow')}</b><Badge tone={mode === 'test' ? 'gray' : 'red'}>{t(`sos.mode.${mode}` as Key)}</Badge></div>
            <div className="mt-2">{t('sos.heard')}: <i>{a.transcript || '…'}</i></div>
            <div className={heardMatch ? 'font-bold text-ok' : 'text-charcoal/70'}>{heardMatch ? t('sos.matched') : t('sos.notMatched')}</div></div>)}
        </section>
      </div>
      <section className="card flex flex-wrap items-center gap-3">
        <button onClick={() => a.trigger('manual', 'live')} className="grid h-20 w-20 place-items-center rounded-full bg-crimson text-xl font-bold text-ivory ring-4 ring-gold">SOS</button>
        <div className="min-w-0 flex-1"><h2 className="font-display text-lg text-crimson">{t('sos.manual')}</h2><p className="text-sm">{t('sos.manualHint')}</p>{a.cooldown > 0 && <p className="text-xs">{t('sos.cooldown', { n: a.cooldown })}</p>}</div>
        <button className="btn-secondary" onClick={() => a.trigger('manual', 'test')}><ShieldAlert className="h-4 w-4" />{t('sos.testButton')}</button>
      </section>
      <section className="card"><label className="label" htmlFor="cd">{t('sos.countdownLen')}: {s.sos_countdown_seconds}</label>
        <input id="cd" type="range" min={5} max={30} step={1} value={s.sos_countdown_seconds} className="w-full accent-crimson" onChange={e => void save({ sos_countdown_seconds: Number(e.target.value) })} /></section>
      <Notice tone="warn" title={t('sos.limits')}>{t('sos.limitsBody')}</Notice>
      <Notice>{t('sos.noPolice')}</Notice>
      <RecentAlerts refreshKey={a.phase.kind} />
    </div>
  );
}
