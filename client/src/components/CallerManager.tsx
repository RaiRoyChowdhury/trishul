import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, User } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { LANGS, type Lang } from '../locales';
import type { Caller } from '../lib/types';
import { Field, Notice } from './ui';
import { VoiceCloner } from './VoiceCloner';

const blank = { name: '', relationship: '', language: 'bn' as Lang, voice_source: 'standard' as Caller['voice_source'], voice_id: '', voice_consent_confirmed: false, speaking_style: '' };

export function CallerManager({ selected, onSelect, onLoaded }: { selected?: string | null; onSelect?: (c: Caller) => void; onLoaded?: (c: Caller[]) => void }) {
  const { t, err } = useI18n();
  const [list, setList] = useState<Caller[] | null>(null);
  const [form, setForm] = useState<(typeof blank & { id?: string }) | null>(null);
  const [voices, setVoices] = useState<{ voice_id: string; name: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = async () => { try { const l = await api.get<Caller[]>('/callers'); setList(l); onLoaded?.(l); } catch (e) { setMsg(err(e)); setList([]); } };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { if (form) api.get<typeof voices>('/voices').then(setVoices).catch(() => setVoices([])); }, [form !== null]); // eslint-disable-line

  const save = async () => {
    if (!form) return; setMsg(null);
    const body = { name: form.name, relationship: form.relationship, language: form.language, voice_source: form.voice_source,
      voice_id: form.voice_id || null, voice_consent_confirmed: form.voice_source === 'consented_sample' && form.voice_consent_confirmed, speaking_style: form.speaking_style || null };
    try { form.id ? await api.put(`/callers/${form.id}`, body) : await api.post('/callers', body); setForm(null); await load(); } catch (e) { setMsg(err(e)); }
  };
  const del = async (id: string) => { if (confirmDel !== id) { setConfirmDel(id); return; } try { await api.del(`/callers/${id}`); setConfirmDel(null); await load(); } catch (e) { setMsg(err(e)); } };

  return (
    <section className="space-y-3" aria-label={t('call.callers')}>
      {msg && <Notice tone="error">{msg}</Notice>}
      {list?.length === 0 && !form && <p className="text-sm text-charcoal/70">{t('call.noCallers')}</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {list?.map(c => (
          <li key={c.id} className={`card flex items-center gap-3 !p-3 ${selected === c.id ? 'ring-2 ring-crimson' : ''}`}>
            <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onSelect?.(c)} disabled={!onSelect}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-champagne text-crimson"><User className="h-5 w-5" /></span>
              <span className="min-w-0"><span className="block truncate font-semibold">{c.name}</span><span className="block truncate text-xs text-charcoal/70">{c.relationship} · {LANGS.find(l => l.code === c.language)?.label}</span></span>
            </button>
            <button className="btn-ghost !px-2" aria-label={t('common.edit')} onClick={() => setForm({ ...blank, ...c, voice_id: c.voice_id ?? '', speaking_style: c.speaking_style ?? '' })}><Pencil className="h-4 w-4" /></button>
            <button className="btn-ghost !px-2 !text-vermilion" aria-label={t('common.delete')} onClick={() => void del(c.id)}>{confirmDel === c.id ? <span className="text-xs">{t('common.confirm')}</span> : <Trash2 className="h-4 w-4" />}</button>
          </li>))}
      </ul>
      {!form && <button className="btn-secondary" onClick={() => setForm({ ...blank })}><Plus className="h-4 w-4" />{t('call.add')}</button>}
      {form && (
        <div className="card space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('common.name')}><input className="input" value={form.name} maxLength={40} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label={t('call.relationship')}><input className="input" value={form.relationship} maxLength={40} onChange={e => setForm({ ...form, relationship: e.target.value })} /></Field>
            <Field label={t('call.language')}><select className="input" value={form.language} onChange={e => setForm({ ...form, language: e.target.value as Lang })}>{LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}</select></Field>
            <Field label={t('call.voice')}>
              <select className="input" value={form.voice_source} onChange={e => setForm({ ...form, voice_source: e.target.value as Caller['voice_source'] })}>
                <option value="standard">{t('call.voiceStd')}</option><option value="consented_sample">{t('call.voiceCons')}</option></select></Field>
          </div>
          {form.voice_source === 'consented_sample' ? (
            form.voice_id.startsWith('svc-')
              ? <div className="flex items-center justify-between gap-2 rounded-xl border border-ok/40 bg-ok/10 p-3 text-sm"><span className="font-semibold text-ok">✓ {t('vc.active')}</span><button type="button" className="btn-ghost !min-h-[36px] !px-3" onClick={() => setForm({ ...form, voice_id: '' })}>{t('vc.replace')}</button></div>
              : <VoiceCloner name={form.name} language={form.language} onCloned={id => setForm(f => (f ? { ...f, voice_id: id, voice_consent_confirmed: true } : f))} />
          ) : (
          <Field label={t('call.voiceId')}>
            {voices.length > 0 ? <select className="input" value={form.voice_id} onChange={e => setForm({ ...form, voice_id: e.target.value })}><option value="">—</option>{voices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}</select>
              : <input className="input" value={form.voice_id} maxLength={64} onChange={e => setForm({ ...form, voice_id: e.target.value.replace(/[^A-Za-z0-9_-]/g, '') })} />}
          </Field>)}
          {form.voice_source === 'consented_sample' && (
            <label className="flex items-start gap-3 rounded-xl bg-champagne p-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5" checked={form.voice_consent_confirmed} onChange={e => setForm({ ...form, voice_consent_confirmed: e.target.checked })} />{t('call.consent')}</label>)}
          <Field label={`${t('call.style')}`}><input className="input" value={form.speaking_style} maxLength={200} onChange={e => setForm({ ...form, speaking_style: e.target.value })} /></Field>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => void save()} disabled={!form.name.trim() || !form.relationship.trim() || (form.voice_source === 'consented_sample' && (!form.voice_consent_confirmed || !form.voice_id))}>{t('common.save')}</button>
            <button className="btn-ghost" onClick={() => setForm(null)}>{t('common.cancel')}</button>
          </div>
        </div>)}
    </section>
  );
}
