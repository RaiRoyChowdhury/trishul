import { useEffect, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { useSaveSettings } from '../lib/settings';
import { geoPermission, micPermission, motionSupported, needsMotionPermission, requestMotion, speechRecognitionSupported } from '../lib/speech';
import { Badge, Field, Notice, PageTitle, Toggle } from '../components/ui';
import { InstallPrompt } from '../components/InstallPrompt';
import { hasSmsConsent, setSmsConsent, smsAvailable } from '../lib/nativeSms';
import { wipeAll, queueCount } from '../lib/localStore';
import { CallerManager } from '../components/CallerManager';
import { SetupBanner } from '../components/SetupBanner';
import { LangSwitch } from '../components/Layout';
import type { Contact } from '../lib/types';
import type { Key } from '../locales';

const blank = { name: '', relationship: '', phone: '', telegram_chat_id: '', consent_confirmed: false };
type Perm = 'granted' | 'denied' | 'prompt' | 'unsupported';

export default function Settings() {
  const { me, refreshMe, health, signOut } = useAuth(); const { t, err } = useI18n(); const save = useSaveSettings();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState<(typeof blank & { id?: string }) | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [name, setName] = useState(me?.profile.display_name ?? '');
  const [perm, setPerm] = useState<{ mic: Perm; geo: Perm; motion: Perm }>({ mic: 'prompt', geo: 'prompt', motion: 'prompt' });
  const [delStep, setDelStep] = useState(0); const [smsOn, setSmsOn] = useState(hasSmsConsent());
  const [tested, setTested] = useState<Record<string, string>>({});
  const savePrivacy = async (patch: Partial<{ privacy_name: 'first' | 'initial'; privacy_photo: boolean; privacy_age: boolean }>) => {
    const p = me?.profile; if (!p) return;
    try { await api.put('/me/privacy', { privacy_name: p.privacy_name ?? 'first', privacy_photo: p.privacy_photo !== false, privacy_age: p.privacy_age !== false, ...patch }); await refreshMe(); setMsg({ tone: 'ok', text: t('pv.saved') }); } catch (e) { setMsg({ tone: 'error', text: err(e) }); }
  };
  const flash = (tone: 'ok' | 'error', text: string) => setMsg({ tone, text });
  const loadContacts = () => api.get<Contact[]>('/contacts').then(setContacts).catch(e => flash('error', err(e)));
  useEffect(() => { void loadContacts(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { void (async () => setPerm({ mic: speechRecognitionSupported() || navigator.mediaDevices ? await micPermission() : 'unsupported', geo: await geoPermission(), motion: !motionSupported() ? 'unsupported' : needsMotionPermission() ? 'prompt' : 'granted' }))(); }, []);
  if (!me) return null;
  const { profile: p, settings: s } = me;
  const wrap = (fn: () => Promise<unknown>, ok = true) => async () => { try { await fn(); if (ok) flash('ok', t('common.saved')); } catch (e) { flash('error', err(e)); } };
  const permBadge = (v: Perm) => <Badge tone={v === 'granted' ? 'ok' : v === 'denied' ? 'red' : 'gray'}>{t(v === 'unsupported' ? 'set.unsupported' : (`set.${v}` as Key))}</Badge>;

  const saveContact = async () => {
    if (!form) return;
    try {
      const body = { name: form.name, relationship: form.relationship || null, phone: form.phone || null, telegram_chat_id: form.telegram_chat_id || null, consent_confirmed: form.consent_confirmed };
      form.id ? await api.put(`/contacts/${form.id}`, body) : await api.post('/contacts', body);
      setForm(null); await loadContacts(); flash('ok', t('common.saved'));
    } catch (e) { flash('error', err(e)); }
  };
  const testContact = async (id: string) => {
    try { const r = await api.post<{ status: string; error?: string }>(`/contacts/${id}/test`); setTested({ ...tested, [id]: r.status === 'sent' ? t('set.testOk') : t('set.testFail', { e: r.error ?? r.status }) }); }
    catch (e) { setTested({ ...tested, [id]: t('set.testFail', { e: err(e) }) }); }
  };

  return (
    <div className="space-y-5">
      <PageTitle title={t('set.title')} />
      <SetupBanner />
      <InstallPrompt />
      {smsAvailable() && <section className="card space-y-1"><Toggle label={t('sms.consentLabel')} checked={smsOn} onChange={v => { setSmsConsent(v); setSmsOn(v); }} /><p className="text-xs text-charcoal/70">{t('sms.consentNote')}</p></section>}
      <section className="card space-y-2"><h2 className="font-display text-lg text-crimson">{t('off.dataTitle')}</h2><p className="text-sm">{t('off.dataBody')}</p><p className="text-xs text-charcoal/70">{t('off.dataWarn')}</p>
        <button className="btn-secondary" onClick={async () => { await wipeAll().catch(() => undefined); window.dispatchEvent(new Event('trishul-queue')); void queueCount(); setMsg({ tone: 'ok', text: t('off.dataDeleted') }); }}><Trash2 className="h-5 w-5" />{t('off.dataDelete')}</button></section>
      {me && me.profile.age_group === 'adult' && (
        <section className="card space-y-1"><h2 className="font-display text-lg text-crimson">{t('pv.title')}</h2>
          <Toggle label={t('pv.name')} checked={me.profile.privacy_name === 'initial'} onChange={v => void savePrivacy({ privacy_name: v ? 'initial' : 'first' })} />
          <Toggle label={t('pv.photo')} checked={me.profile.privacy_photo !== false} onChange={v => void savePrivacy({ privacy_photo: v })} />
          <Toggle label={t('pv.age')} checked={me.profile.privacy_age !== false} onChange={v => void savePrivacy({ privacy_age: v })} />
          <p className="text-xs text-charcoal/70">{t('pv.note')}</p></section>)}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <section className="card space-y-3"><h2 className="font-display text-lg text-crimson">{t('set.profile')}</h2>
        <div className="flex flex-wrap items-end gap-2"><div className="min-w-[200px] flex-1"><Field label={t('set.displayName')}><input className="input" value={name} maxLength={60} onChange={e => setName(e.target.value)} /></Field></div>
          <button className="btn-primary" disabled={!name.trim() || name === p.display_name} onClick={wrap(async () => { await api.patch('/me/profile', { display_name: name.trim() }); await refreshMe(); })}>{t('common.save')}</button></div>
        <ul className="space-y-1 text-sm">
          <li>{t('set.ageGroup')}: <Badge>{t(p.age_group === 'teen' ? 'auth.teen' : 'auth.adult')}</Badge></li>
          <li>{t('set.verification')}: <Badge tone="gray">{t(`set.ver.${p.verification_status}` as Key)}</Badge></li>
          {p.age_group === 'teen' && <li>{t('set.guardian')}: <Badge tone={p.guardian_consent ? 'ok' : 'red'}>{t(p.guardian_consent ? 'set.recorded' : 'set.notRecorded')}</Badge></li>}
        </ul>
        <div><span className="label">{t('set.language')}</span><LangSwitch /></div>
      </section>

      <section className="card space-y-3"><h2 className="font-display text-lg text-crimson">{t('set.contacts')}</h2>
        <p className="text-sm text-charcoal/80">{t('set.contactsHelp')}</p>
        <ul className="space-y-2">{contacts.map(c => (
          <li key={c.id} className="rounded-xl border border-gold/40 bg-white p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><span className="font-semibold">{c.name}</span> <span className="text-charcoal/70">{c.relationship}</span><div className="text-xs text-charcoal/70">{c.phone} {c.telegram_chat_id && `· TG ${c.telegram_chat_id}`}</div></div>
              <div className="flex flex-wrap gap-1"><Badge tone={c.consent_confirmed ? 'ok' : 'red'}>{c.consent_confirmed ? '✓' : '✗'} {t('set.contactConsent')}</Badge></div></div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn-secondary !min-h-[40px]" onClick={() => void testContact(c.id)}><Send className="h-4 w-4" />{t('set.testMsg')}</button>
              <button className="btn-ghost !min-h-[40px]" onClick={() => setForm({ ...blank, ...c, relationship: c.relationship ?? '', phone: c.phone ?? '', telegram_chat_id: c.telegram_chat_id ?? '' })}>{t('common.edit')}</button>
              <button className="btn-ghost !min-h-[40px] !text-vermilion" onClick={wrap(async () => { await api.del(`/contacts/${c.id}`); await loadContacts(); })}>{t('common.delete')}</button></div>
            {tested[c.id] && <p className="mt-1 text-xs" role="status">{tested[c.id]}</p>}
          </li>))}</ul>
        {!form && <button className="btn-secondary" onClick={() => setForm({ ...blank })}>{t('set.addContact')}</button>}
        {form && (<div className="space-y-3 rounded-xl bg-champagne p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('common.name')}><input className="input" value={form.name} maxLength={60} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label={t('call.relationship')}><input className="input" value={form.relationship} maxLength={40} onChange={e => setForm({ ...form, relationship: e.target.value })} /></Field>
            <Field label={t('set.phone')}><input className="input" inputMode="tel" placeholder="+919876543210" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value.replace(/[^\d+]/g, '') })} /></Field>
            <Field label={t('set.telegram')}><input className="input" inputMode="numeric" value={form.telegram_chat_id} onChange={e => setForm({ ...form, telegram_chat_id: e.target.value.replace(/[^\d-]/g, '') })} /></Field></div>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5" checked={form.consent_confirmed} onChange={e => setForm({ ...form, consent_confirmed: e.target.checked })} />{t('set.contactConsent')}</label>
          <div className="flex gap-2"><button className="btn-primary" disabled={!form.name.trim() || (!form.phone && !form.telegram_chat_id)} onClick={() => void saveContact()}>{t('common.save')}</button><button className="btn-ghost" onClick={() => setForm(null)}>{t('common.cancel')}</button></div></div>)}
      </section>

      <section className="card space-y-2"><h2 className="font-display text-lg text-crimson">{t('set.callers')}</h2><CallerManager /></section>

      <section className="card space-y-1"><h2 className="font-display text-lg text-crimson">{t('set.privacy')}</h2>
        <Toggle label={t('set.locConsent')} checked={s.location_consent} onChange={v => void wrap(() => save({ location_consent: v }))()} />
        <div className="py-1"><Field label={t('set.voiceEngine')}><select className="input" value={s.voice_engine} onChange={e => void wrap(() => save({ voice_engine: e.target.value as 'cloud' | 'device' }))()}><option value="cloud">{t('set.cloud')}</option><option value="device">{t('set.device')}</option></select></Field></div>
      </section>

      <section className="card space-y-1"><h2 className="font-display text-lg text-crimson">{t('set.features')}</h2>
        <Toggle label={`${t('nav.sos')}`} checked={s.sos_enabled} onChange={v => void wrap(() => save({ sos_enabled: v }))()} />
        <Toggle label={`${t('nav.noTouch')}`} checked={s.nt_enabled} onChange={v => void wrap(() => save({ nt_enabled: v }))()} />
      </section>

      <section className="card space-y-1"><h2 className="font-display text-lg text-crimson">{t('set.access')}</h2>
        {(['large_text', 'high_contrast', 'reduce_motion'] as const).map(k => <Toggle key={k} label={t(k === 'large_text' ? 'set.largeText' : k === 'high_contrast' ? 'set.contrast' : 'set.motion')} checked={!!s.accessibility[k]} onChange={v => void wrap(() => save({ accessibility: { ...s.accessibility, [k]: v } }))()} />)}
      </section>

      <section className="card space-y-2"><h2 className="font-display text-lg text-crimson">{t('set.perms')}</h2>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between">{t('set.mic')} {permBadge(perm.mic)}</li>
          <li className="flex items-center justify-between">{t('set.geo')} {permBadge(perm.geo)}</li>
          <li className="flex items-center justify-between gap-2">{t('set.motionSensor')} <span className="flex items-center gap-2">{permBadge(perm.motion)}{perm.motion === 'prompt' && <button className="btn-secondary !min-h-[36px] !px-3" onClick={() => void requestMotion().then(ok => setPerm({ ...perm, motion: ok ? 'granted' : 'denied' }))}>{t('nt.grantMotion')}</button>}</span></li>
        </ul>
        <h3 className="pt-2 font-semibold text-crimson">{t('set.notif')}</h3>
        {health && health !== 'down' ? <ul className="text-sm"><li>Telegram: <Badge tone={health.services.telegram ? 'ok' : 'gray'}>{t(health.services.telegram ? 'setup.ok' : 'setup.missing')}</Badge></li><li>SMS: <Badge tone={health.services.twilio ? 'ok' : 'gray'}>{t(health.services.twilio ? 'setup.ok' : 'setup.missing')}</Badge></li></ul> : <p className="text-sm">{t('setup.serverDown')}</p>}
      </section>

      <section className="card space-y-2 !border-vermilion/60"><h2 className="font-display text-lg text-vermilion">{t('set.danger')}</h2><p className="text-sm">{t('set.dangerBody')}</p>
        <button className="btn-danger" onClick={async () => { if (delStep === 0) { setDelStep(1); return; } try { await api.del('/me'); await signOut(); } catch (e) { flash('error', err(e)); } }}><Trash2 className="h-4 w-4" />{delStep ? t('common.confirm') : t('set.deleteBtn')}</button></section>
    </div>
  );
}
