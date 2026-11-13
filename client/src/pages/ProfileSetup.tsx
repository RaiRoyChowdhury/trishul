import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Camera, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { Avatar } from '../components/Avatar';
import { Field, Notice, PageTitle } from '../components/ui';
import type { Profession } from '../lib/types';
import type { Key } from '../locales';

const PROFS: Profession[] = ['student', 'working', 'homemaker', 'self_employed', 'other'];

/** Downscale to at most 512 px and re-encode as JPEG: smaller upload, and strips camera metadata such as GPS. */
async function resizePhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file); const k = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error('encode'))), 'image/jpeg', 0.85));
}

export default function ProfileSetup() {
  const { me, refreshMe } = useAuth(); const { t, err } = useI18n(); const nav = useNavigate();
  const p = me!.profile; const teen = p.age_group === 'teen';
  const [age, setAge] = useState(p.age ? String(p.age) : ''); const [prof, setProf] = useState<Profession | ''>(p.profession ?? '');
  const [org, setOrg] = useState(p.organisation ?? ''); const [decl, setDecl] = useState(!!p.gender_declared);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null); const [photoTick, setPhotoTick] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return; setMsg(null); setBusy(true);
    try { const blob = await resizePhoto(f); setPreview(URL.createObjectURL(blob)); await api.upload('/me/photo', blob); await refreshMe(); setPhotoTick(x => x + 1); setMsg({ tone: 'ok', text: t('pf.photoSaved') }); }
    catch (e) { setMsg({ tone: 'error', text: e instanceof Error && !('code' in e) ? t('pf.photoBad') : err(e) }); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setMsg(null);
    try { await api.put('/me/onboarding', { age: Number(age), profession: prof, organisation: org.trim() || undefined, gender_declared: true }); await refreshMe(); setMsg({ tone: 'ok', text: t('pf.saved') }); }
    catch (e) { setMsg({ tone: 'error', text: err(e) }); } finally { setBusy(false); }
  };
  const verify = async () => { setMsg(null); try { await api.post('/me/verify/start'); } catch (e) { setMsg({ tone: 'error', text: err(e) }); } };
  const valid = Number(age) >= (teen ? 13 : 18) && Number(age) <= (teen ? 17 : 100) && !!prof && decl;
  const ph = p.photo_status ?? 'none';

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={t('pf.title')} sub={t('pf.intro')} />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <section className="card space-y-4">
        <div className="flex items-center gap-4">
          {preview ? <img src={preview} alt="" className="h-24 w-24 rounded-2xl border-2 border-gold object-cover shadow-md" /> : <Avatar userId={p.id} name={p.display_name} show={ph === 'approved' || ph === 'pending'} size={96} refresh={photoTick} />}
          <div className="min-w-0 space-y-1"><h2 className="font-display text-lg text-crimson">{t('pf.photo')}</h2>
            <p className="text-xs text-charcoal/75">{teen ? t('pf.photoTeen') : t('pf.photoHelp')}</p>
            <label className="btn-secondary !min-h-[40px] cursor-pointer"><Camera className="h-4 w-4" />{t('pf.photoPick')}<input type="file" accept="image/*" capture="user" className="sr-only" disabled={busy} onChange={e => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }} /></label>
            <p className="text-xs font-semibold text-charcoal/70">{t(`pf.ph.${ph}` as Key)}</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('pf.age')} hint={teen ? t('pf.ageTeenHint') : undefined}><input className="input" inputMode="numeric" value={age} onChange={e => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))} /></Field>
          <Field label={t('pf.profession')}><select className="input" value={prof} onChange={e => setProf(e.target.value as Profession)}><option value="">—</option>{PROFS.map(x => <option key={x} value={x}>{t(`pf.prof.${x}` as Key)}</option>)}</select></Field>
        </div>
        {!teen && <Field label={t('pf.org')}><input className="input" maxLength={80} value={org} onChange={e => setOrg(e.target.value)} /></Field>}
        <label className="flex items-start gap-3 rounded-xl bg-champagne p-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5" checked={decl} onChange={e => setDecl(e.target.checked)} />{t('pf.decl')}</label>
        <button className="btn-primary w-full" disabled={!valid || busy} onClick={() => void save()}>{t('pf.save')}</button>
      </section>
      <section className="card space-y-3">
        <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-crimson" aria-hidden /><h2 className="font-display text-lg text-crimson">{t('pf.verify')}</h2></div>
        {p.verification_status === 'verified' ? <p className="flex items-center gap-2 font-semibold text-ok"><BadgeCheck className="h-5 w-5" />{t('pf.verified')}</p> : <>
          <p className="text-sm">{t('pf.verifyBody')}</p><p className="text-xs text-charcoal/70">{p.verification_status === 'test_account' ? t('pf.demoAcct') : t('pf.notVerified')}</p>
          <button className="btn-secondary" onClick={() => void verify()}>{t('pf.verifyBtn')}</button></>}
      </section>
      <button className="btn-ghost" onClick={() => nav('/walk')}>{t('pf.toWalk')}</button>
    </div>
  );
}
