import { useEffect, useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { useAlert } from '../lib/alert';
import { useI18n } from '../lib/i18n';
import { secondsLeft } from '../lib/alertRules';
import type { Key } from '../locales';

export function AlertOverlay() {
  const { phase, cancel, dismiss, lastCancel } = useAlert();
  const { t } = useI18n();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (phase.kind !== 'counting') return; const i = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(i); }, [phase]);
  if (phase.kind === 'idle') { return lastCancel ? <Toast text={t('sos.cancelled', { n: lastCancel.followUps })} /> : null; }

  const test = (phase.kind === 'counting' || phase.kind === 'sending' || phase.kind === 'done') && phase.mode === 'test';
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-crimson-dark/90 p-4 text-ivory backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-live="assertive">
      <div className="w-full max-w-md animate-pop-in overflow-hidden rounded-3xl border-2 border-gold bg-gradient-to-b from-crimson-light to-crimson-dark p-6 text-center shadow-2xl">
        <span className="mx-auto grid h-20 w-20 animate-ring-pulse place-items-center rounded-full bg-gold/20 ring-2 ring-gold"><ShieldAlert className="h-11 w-11 text-gold-light" aria-hidden /></span>
        {test && (<>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1 text-xs font-bold uppercase tracking-wider text-crimson-dark">{t('call.demoMode')}</div>
          <h2 className="mt-3 font-display text-2xl leading-snug sm:text-3xl">{t('al.demoTitle')}</h2>
          <p className="mt-1 text-sm text-ivory/90">{t('al.demoConfirm')}</p>
          <p className="mx-auto mt-3 rounded-xl border border-gold/50 bg-crimson-dark/60 p-3 text-sm font-semibold text-gold-light" role="note">{t('al.demoNoSend')}</p>
        </>)}
        {phase.kind === 'counting' && (<>
          <div className="mt-3 font-display text-7xl" aria-label={t('sos.countdown', { n: secondsLeft(phase.deadline, now) })}>{secondsLeft(phase.deadline, now)}</div>
          <p className="mt-1 text-lg font-semibold">{t('sos.countdown', { n: secondsLeft(phase.deadline, now) })}</p>
          <p className="mt-2 text-sm opacity-90">{test ? t('nt.testMode') : t('sos.countdownHint')}</p>
          <button className="btn mt-5 w-full bg-ivory text-crimson text-lg min-h-[60px] shadow-lg hover:bg-champagne" onClick={() => void cancel()} autoFocus>{t('sos.cancel')}</button>
        </>)}
        {phase.kind === 'queued' && (<>
          <h2 className="mt-3 font-display text-2xl">{t('off.sosTitle')}</h2>
          <p className="mt-2 rounded-xl border border-gold/50 bg-crimson-dark/60 p-3 text-sm font-semibold" role="alert">{t('off.sosBody')}</p>
          <p className="mt-2 text-xs opacity-90">{t(phase.locIncluded ? 'sos.locIn' : 'sos.locOut')} · {t('off.sosNoSms')}</p>
          {phase.sms && phase.sms.length > 0 && <ul className="mt-2 space-y-1 text-left text-xs">{phase.sms.map((s, i) => <li key={i} className="rounded-lg bg-crimson-dark/60 p-2"><b>{s.name}</b> · SMS: {t(`sms.${s.status}` as Key)}</li>)}</ul>}
          {phase.smsHref && <><a href={phase.smsHref} className="btn mt-4 w-full border-2 border-gold bg-gold text-lg font-bold text-crimson-dark">{t('off.smsOpen')}</a><p className="mt-1 text-xs opacity-90">{t('off.smsOpenNote')}</p></>}
          <a href="tel:112" className={`btn ${phase.smsHref ? 'mt-2' : 'mt-4'} w-full bg-ivory text-lg text-crimson`}>{t('off.sosCall')}</a>
          <div className="mt-2 flex gap-2"><button className="btn flex-1 border border-gold text-ivory" onClick={() => void cancel()}>{t('off.sosCancelLocal')}</button><button className="btn flex-1 border border-gold text-ivory" onClick={dismiss}>{t('common.close')}</button></div>
        </>)}
        {phase.kind === 'sending' && <p className="mt-4 text-lg">{t('sos.sending')}</p>}
        {phase.kind === 'done' && (<>
          {phase.note && <p className="mt-2 rounded-xl border border-gold/50 bg-crimson-dark/60 p-2 text-xs">{phase.note}</p>}
          {test ? <p className="mt-2 text-xs opacity-80">{t('sos.testRecorded')}</p> : <h2 className="mt-3 font-display text-2xl">{t('sos.created')}</h2>}
          <p className="mt-1 text-xs opacity-80">{t(phase.locIncluded ? 'sos.locIn' : 'sos.locOut')}</p>
          {!test && (
            <ul className="mt-3 space-y-2 text-left text-sm">
              {phase.event.notification_attempts.map((a, i) => (
                <li key={i} className="rounded-xl border border-gold/20 bg-crimson-dark/60 p-2.5">
                  <div className="flex justify-between gap-2"><span className="font-semibold">{a.contact_name}</span><span>{a.channel}</span></div>
                  <div className={a.status === 'sent' ? 'text-gold-light' : 'text-white'}>{t(`sos.st.${a.status}` as Key)}</div>
                  {a.error_message && <div className="text-xs opacity-80">{a.error_message}</div>}
                </li>))}
            </ul>)}
          {!test && <p className="mt-3 text-xs font-semibold">{t('sos.noPolice')}</p>}
          <div className="mt-4 flex gap-2">
            {!test && <button className="btn flex-1 bg-ivory text-crimson" onClick={() => void cancel()}>{t('sos.cancel')}</button>}
            <button className="btn flex-1 border border-gold text-ivory" onClick={dismiss}>{t('common.close')}</button>
          </div>
        </>)}
        {phase.kind === 'error' && (<>
          <p className="mt-4" role="alert">{phase.message}</p>
          <p className="mt-2 text-sm font-semibold">{t('sos.noPolice')}</p>
          <button className="btn mt-4 w-full bg-ivory text-crimson" onClick={dismiss}><X className="h-4 w-4" />{t('common.close')}</button>
        </>)}
      </div>
    </div>
  );
}
function Toast({ text }: { text: string }) {
  const [show, setShow] = useState(true);
  useEffect(() => { const i = setTimeout(() => setShow(false), 6000); return () => clearTimeout(i); }, []);
  return show ? <div className="fixed bottom-24 left-1/2 z-[1500] -translate-x-1/2 animate-pop-in rounded-2xl border border-gold/40 bg-charcoal px-4 py-2.5 text-sm text-ivory shadow-lift" role="status">{text}</div> : null;
}
