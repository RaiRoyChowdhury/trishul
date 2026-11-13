import { useEffect, useState } from 'react';
import { Archive, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useDemoMode, DEMO_EVIDENCE } from '../lib/demoMode';
import { Badge, Field, Notice, PageTitle } from '../components/ui';

interface Rec { id: string; title: string; description: string | null; incident_at: string; retention_days: number }
export default function Evidence() {
  const { t, err, lang } = useI18n(); const demo = useDemoMode();
  const [rows, setRows] = useState<Rec[]>([]); const [audit, setAudit] = useState<{ action: string; created_at: string }[]>([]);
  const [f, setF] = useState({ title: '', description: '', days: 90 }); const [msg, setMsg] = useState<string | null>(null);
  const load = async () => {
    if (demo.on) { setRows(DEMO_EVIDENCE); setAudit([]); return; }
    try { setRows(await api.get<Rec[]>('/evidence')); setAudit(await api.get('/evidence/audit')); } catch (e) { setMsg(err(e)); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [demo.on]);
  const add = async () => { try { await api.post('/evidence', { title: f.title, description: f.description || undefined, retention_days: f.days }); setF({ title: '', description: '', days: 90 }); await load(); } catch (e) { setMsg(err(e)); } };
  const del = async (id: string) => { if (demo.on) return; try { await api.del(`/evidence/${id}`); await load(); } catch (e) { setMsg(err(e)); } };
  const when = (s: string) => new Date(s).toLocaleString(lang === 'en' ? 'en-IN' : lang === 'hi' ? 'hi-IN' : 'bn-IN', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className="space-y-4">
      <PageTitle title={t('ev.title')} sub={t('ev.intro')} />
      {msg && <Notice tone="error">{msg}</Notice>}
      {!demo.on && <section className="card space-y-3"><div className="grid gap-3 sm:grid-cols-2"><Field label={t('ev.fTitle')}><input className="input" maxLength={100} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
        <Field label={t('ev.fKeep')}><input className="input" type="number" min={1} max={3650} value={f.days} onChange={e => setF({ ...f, days: Number(e.target.value) || 90 })} /></Field></div>
        <Field label={t('ev.fDesc')}><textarea className="input min-h-[90px]" maxLength={2000} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
        <button className="btn-primary" disabled={!f.title.trim()} onClick={() => void add()}><Archive className="h-5 w-5" />{t('ev.add')}</button></section>}
      {rows.length === 0 ? <p className="card text-sm">{t('ev.none')}</p> : <ul className="space-y-2">{rows.map(r => (
        <li key={r.id} className="card flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><b>{r.title}</b>{demo.on && <> <Badge tone="gold">{t('ev.demoTag')}</Badge></>}<p className="text-xs text-charcoal/70">{when(r.incident_at)} · {t('ev.keepDays', { n: r.retention_days })}</p>{r.description && <p className="mt-1 text-sm">{r.description}</p>}</div>
          {!demo.on && <button className="btn-ghost !text-vermilion" onClick={() => void del(r.id)}><Trash2 className="h-4 w-4" />{t('ev.delete')}</button>}</li>))}</ul>}
      {!demo.on && audit.length > 0 && <section className="card"><h2 className="font-display text-lg text-crimson">{t('ev.audit')}</h2><ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-xs">{audit.map((a, i) => <li key={i}>{when(a.created_at)} · {a.action}</li>)}</ul></section>}
    </div>
  );
}
