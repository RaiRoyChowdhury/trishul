import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Link } from 'react-router-dom';
import { Badge, Notice, PageTitle } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { useDemoMode, DEMO_USERS } from '../lib/demoMode';
import type { Key } from '../locales';

type Tp = 'idle' | 'qr' | 'scanned' | 'verified';
export default function JudgeDemo() {
  const { t } = useI18n(); const demo = useDemoMode();
  const [tp, setTp] = useState<Tp>('idle'); const [sos, setSos] = useState(false); const [tg, setTg] = useState(false); const [off, setOff] = useState(false);
  const [qr, setQr] = useState('');
  const reset = () => { setTp('idle'); setSos(false); setTg(false); setOff(false); };
  // A SAMPLE picture only. It does not start with the real TrustPass prefix, so the real scanner ignores it.
  useEffect(() => { void QRCode.toDataURL('TRISHUL-DEMO-SAMPLE-NOT-A-TRUSTPASS', { margin: 1, width: 240 }).then(setQr).catch(() => setQr('')); }, []);
  const smsDemo = `sms:?body=${encodeURIComponent('TRISHUL SOS (DEMO): I need help. This is a demo message, no real emergency.')}`;
  const next: Record<Tp, Tp> = { idle: 'qr', qr: 'scanned', scanned: 'verified', verified: 'verified' };
  return (
    <div className="space-y-4">
      <PageTitle title={t('demo.title')} sub={t('demo.intro')} />
      <div className="flex flex-wrap gap-2"><button className={demo.on ? 'btn-secondary' : 'btn-primary'} disabled={demo.forced} onClick={() => demo.set(!demo.on)}>{demo.on ? t('demo.off') : t('demo.on')}</button>
        <button className="btn-secondary" onClick={reset}>{t('demo.reset')}</button></div>
      {!demo.on ? <Notice>{t('demo.banner')}</Notice> : <>
        <section className="card"><h2 className="font-display text-lg text-crimson">{t('demo.users')}</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">{DEMO_USERS.map(u => <li key={u.id} className="flex items-center justify-between gap-2 rounded-xl bg-champagne p-2 text-sm"><span><b>{u.name}</b> <span className="text-charcoal/70">· {u.role}</span></span><Badge tone="gold">{u.note}</Badge></li>)}</ul></section>
        <section className="card space-y-2"><h2 className="font-display text-lg text-crimson">{t('demo.step.trust')}</h2><p className="flex flex-wrap items-center gap-2"><Badge tone={tp === 'verified' ? 'ok' : 'gold'}>{t(`demo.state.${tp}` as Key)}</Badge><Badge tone="gray">{t('demo.simulated')}</Badge></p>
          {tp === 'qr' && qr && <figure className="flex flex-col items-center gap-1"><img src={qr} alt="" className="h-48 w-48 rounded-xl bg-white p-2 shadow" /><figcaption className="text-center text-xs text-charcoal/70">{t('demo.qrCaption')}</figcaption></figure>}
          <button className="btn-primary" disabled={tp === 'verified'} onClick={() => setTp(next[tp])}>{t('demo.next')}</button></section>
        <section className="card space-y-2"><h2 className="font-display text-lg text-crimson">{t('demo.step.sos')}</h2>
          <button className="btn-danger" onClick={() => { setSos(true); setTg(false); }}>SOS ({t('demo.simulated')})</button>
          {sos && <Notice tone="warn">{t('demo.sosFired')}</Notice>}</section>
        <section className="card space-y-2"><h2 className="font-display text-lg text-crimson">{t('demo.step.telegram')}</h2>
          <button className="btn-secondary" disabled={!sos} onClick={() => setTg(true)}>{t('demo.next')}</button>{tg && <Notice tone="ok">{t('demo.tgSent')}</Notice>}</section>
        <section className="card space-y-2"><h2 className="font-display text-lg text-crimson">{t('demo.step.sms')}</h2>
          <button className="btn-danger" onClick={() => setOff(true)}>{t('demo.sms.simulate')}</button>
          {off && <div className="space-y-2 rounded-2xl border-2 border-gold bg-crimson p-4 text-ivory" role="status">
            <h3 className="font-display text-xl">{t('off.sosTitle')}</h3><p className="text-sm">{t('off.sosBody')}</p>
            <a href={smsDemo} className="btn w-full border-2 border-gold bg-gold font-bold text-crimson-dark">{t('off.smsOpen')}</a>
            <p className="text-xs opacity-90">{t('off.smsOpenNote')}</p><p className="text-xs font-semibold">{t('demo.sms.note')}</p></div>}</section>
        <section className="card space-y-2"><p className="text-sm">{t('demo.safetyNote')}</p><div className="flex flex-wrap gap-2"><Link className="btn-secondary" to="/map">{t('nav.map')}</Link><Link className="btn-secondary" to="/shakti">{t('nav.shakti')}</Link><Link className="btn-secondary" to="/vault">{t('nav.vault')}</Link><Link className="btn-secondary" to="/call">{t('nav.call')}</Link></div></section></>}
    </div>
  );
}
