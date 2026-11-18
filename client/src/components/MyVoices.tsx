import { useState } from 'react';
import { Check, Plus, Trash2, UserPlus } from 'lucide-react';
import type { Lang } from '../locales';
import { useI18n } from '../lib/i18n';
import { addMyVoice, removeMyVoice, type MyVoice } from '../lib/myVoices';

type Row = { text: string; file: File | null };
const blank = (): Row => ({ text: '', file: null });

/** Lets each user write their own call script and add their own recordings. Stays on this phone only. */
export function MyVoicesPanel({ mine, onChange }: { mine: MyVoice[]; onChange: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [name, setName] = useState(''); const [rel, setRel] = useState(''); const [language, setLanguage] = useState<Lang>('bn');
  const [rows, setRows] = useState<Row[]>([blank()]); const [consent, setConsent] = useState(false);
  const ok = name.trim() !== '' && consent && rows.some(r => r.text.trim() !== '');
  const setRow = (i: number, p: Partial<Row>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const reset = () => { setName(''); setRel(''); setRows([blank()]); setConsent(false); setOpen(false); };
  const save = async () => { setBusy(true); try { await addMyVoice({ name: name.trim(), relationship: rel.trim(), language }, rows); reset(); onChange(); } finally { setBusy(false); } };

  return (
    <div className="mt-3 rounded-xl border border-gold/50 bg-champagne/50 p-3 text-sm" data-testid="my-voices">
      <p className="flex items-center gap-2 font-semibold text-crimson"><UserPlus className="h-4 w-4" aria-hidden />{t('mv.title')}</p>
      <p className="mt-1 text-xs text-charcoal/80">{t('mv.note')}</p>
      {mine.map(v => (
        <div key={v.id} className="mt-2 flex items-center justify-between rounded-lg bg-ivory p-2">
          <span><b>{v.name}</b> <span className="text-xs text-charcoal/70">· {t('mv.lines', { n: v.lines.length })}</span></span>
          <button className="btn-secondary" aria-label={t('mv.del', { name: v.name })} onClick={() => { void removeMyVoice(v.id).then(onChange); }}><Trash2 className="h-4 w-4" aria-hidden /></button>
        </div>))}
      {!open && <button className="btn-secondary mt-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />{t('mv.add')}</button>}
      {open && (
        <div className="mt-2 space-y-2">
          <input className="input w-full" placeholder={t('mv.name')} value={name} onChange={e => setName(e.target.value)} />
          <input className="input w-full" placeholder={t('mv.rel')} value={rel} onChange={e => setRel(e.target.value)} />
          <select className="input w-full" value={language} onChange={e => setLanguage(e.target.value as Lang)} aria-label={t('mv.lang')}>
            <option value="bn">বাংলা</option><option value="hi">हिन्दी</option><option value="en">English</option></select>
          <p className="text-xs">{t('mv.order')}</p>
          {rows.map((r, i) => (
            <div key={i} className="space-y-1 rounded-lg border border-gold/40 p-2">
              <textarea className="input w-full" rows={2} placeholder={t('mv.line', { n: i + 1 })} value={r.text} onChange={e => setRow(i, { text: e.target.value })} />
              <label className="btn-secondary cursor-pointer">{r.file ? <><Check className="h-4 w-4" aria-hidden />{r.file.name}</> : t('mv.rec')}
                <input type="file" accept="audio/*" className="sr-only" onChange={e => { setRow(i, { file: e.target.files?.[0] ?? null }); e.target.value = ''; }} /></label>
            </div>))}
          <button className="btn-secondary" onClick={() => setRows(rs => [...rs, blank()])}><Plus className="h-4 w-4" aria-hidden />{t('mv.more')}</button>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5" />{t('mv.consent')}</label>
          <p className="text-xs text-charcoal/70">{t('mv.fallback')}</p>
          <div className="flex gap-2"><button className="btn-primary" disabled={!ok || busy} onClick={() => { void save(); }}>{t('mv.save')}</button><button className="btn-secondary" onClick={reset}>{t('mv.cancel')}</button></div>
        </div>)}
    </div>);
}