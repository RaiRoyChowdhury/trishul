import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { LangSwitch } from '../components/Layout';
import { Field, Notice } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { SetupBanner } from '../components/SetupBanner';
import type { Key } from '../locales';

const seen = () => { try { return localStorage.getItem('trishul.onboarded') === '1'; } catch { return false; } };

export default function Welcome() {
  const { session, configured, signIn, signUp } = useAuth(); const { t, lang } = useI18n();
  const [step, setStep] = useState(seen() ? 3 : 0);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [f, setF] = useState({ email: '', password: '', name: '', age: 'adult' as 'adult' | 'teen' });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  if (session) return <Navigate to="/" replace />;

  const finish = () => { try { localStorage.setItem('trishul.onboarded', '1'); } catch { /* ignore */ } setStep(3); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      if (mode === 'in') await signIn(f.email, f.password);
      else { const r = await signUp({ email: f.email, password: f.password, name: f.name, age_group: f.age, language: lang }); if (r.needsEmail) setMsg({ tone: 'ok', text: t('auth.checkEmail') }); }
    } catch (x) { setMsg({ tone: 'error', text: (x as Error).message }); } finally { setBusy(false); }
  };

  return (
    <div className="alpana min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-4 md:max-w-3xl">
        <div className="flex justify-end"><LangSwitch /></div>
        {step < 3 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center md:flex-row md:text-left md:gap-10">
            <div className="grid h-64 w-64 shrink-0 place-items-center overflow-hidden rounded-3xl border border-gold bg-[#FAF1DE] shadow-card md:h-80 md:w-80">
              {step === 0 && <img src="/assets/durga-character.png" alt="Durga" className="h-full w-full object-cover" style={{ objectPosition: '50% 50%', transform: 'scale(1.0)' }} />}
              {step === 1 && <img src="/assets/trishul-logo-640.png" alt="TRISHUL" className="h-full w-full object-cover" />}
              {step === 2 && <img src="/assets/trishul-logo-640.png" alt="TRISHUL" className="h-full w-full object-cover" />}
            </div>
            <div className="flex flex-col items-center gap-4 md:items-start">
              <h1 className="font-display text-3xl text-crimson">{t(`onb.${step + 1}.t` as Key)}</h1>
              <p className="max-w-sm text-lg text-charcoal/80">{t(`onb.${step + 1}.b` as Key)}</p>
              <div className="flex gap-2" aria-hidden>{[0, 1, 2].map(i => <span key={i} className={`h-2.5 rounded-full ${i === step ? 'w-8 bg-crimson' : 'w-2.5 bg-gold'}`} />)}</div>
              <div className="flex w-full gap-2">
                <button className="btn-ghost" onClick={finish}>{t('onb.skip')}</button>
                <button className="btn-primary flex-1" onClick={() => (step < 2 ? setStep(step + 1) : finish())}>{step < 2 ? t('onb.next') : t('onb.start')}</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-center gap-4">
            <div className="flex flex-col items-center gap-2 text-center"><Logo height={120} /><h1 className="font-display text-2xl text-crimson">{t('auth.title')}</h1><p className="text-charcoal/80">{t('app.tagline')}</p></div>
            <SetupBanner />
            {!configured ? <Notice tone="warn">{t('auth.notConfigured')}</Notice> : (
              <form onSubmit={e => void submit(e)} className="card space-y-3">
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-champagne p-1" role="tablist">
                  {(['in', 'up'] as const).map(m => <button type="button" role="tab" aria-selected={mode === m} key={m} onClick={() => setMode(m)} className={`min-h-[44px] rounded-lg font-semibold ${mode === m ? 'bg-crimson text-ivory' : 'text-crimson'}`}>{t(m === 'in' ? 'auth.signIn' : 'auth.signUp')}</button>)}
                </div>
                {mode === 'up' && <Field label={t('auth.name')}><input className="input" required maxLength={60} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoComplete="name" /></Field>}
                <Field label={t('auth.email')}><input className="input" type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} autoComplete="email" /></Field>
                <Field label={t('auth.password')}><input className="input" type="password" required minLength={8} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></Field>
                {mode === 'up' && (<>
                  <Field label={t('auth.ageGroup')}><select className="input" value={f.age} onChange={e => setF({ ...f, age: e.target.value as 'adult' | 'teen' })}><option value="adult">{t('auth.adult')}</option><option value="teen">{t('auth.teen')}</option></select></Field>
                  {f.age === 'teen' && <Notice>{t('auth.teenNote')}</Notice>}
                  <Notice>{t('auth.testAccount')}</Notice></>)}
                {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
                <button className="btn-primary w-full" disabled={busy}>{t(mode === 'in' ? 'auth.signIn' : 'auth.signUp')}</button>
                <button type="button" className="btn-ghost w-full text-sm" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{t(mode === 'in' ? 'auth.noAccount' : 'auth.haveAccount')}</button>
              </form>)}
            <p className="text-center text-xs text-charcoal/70">{t('app.disclaimer')}</p>
            <p className="text-center text-xs font-semibold text-charcoal/70">© 2026 TRISHUL · Created by Rai Roy Chowdhury</p>
          </div>)}
      </div>
    </div>
  );
}
