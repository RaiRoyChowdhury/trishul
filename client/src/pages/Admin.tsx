import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { Badge, Field, Notice, PageTitle } from '../components/ui';

interface Ov { ai: { status: { mode: 'live' | 'demo'; reason: string; remaining_paise: number; expires_at: string | null }; config: { budget_paise: number; spent_paise: number; reserved_paise: number; activated_at: string | null }; models: Record<string, string> };
  services: Record<string, boolean>; counts: Record<string, number>; ledger: { id: string; created_at: string; operation: string; status: string; estimated_paise: number; actual_paise: number | null; model: string }[]; audit: { action: string; created_at: string }[] }
const rs = (p: number) => `₹${(p / 100).toFixed(2)}`;

export default function Admin() {
  const { me } = useAuth(); const { t, err } = useI18n();
  const [ov, setOv] = useState<Ov | null>(null); const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [budget, setBudget] = useState(''); const [arm, setArm] = useState<string | null>(null);
  const [reports, setReports] = useState<{ id: string; category: string; area_label: string | null; status: string; description: string | null }[]>([]);
  const [users, setUsers] = useState<{ id: string; display_name: string; age_group: string; role: string; photo_status: string }[]>([]);
  const load = useCallback(async () => {
    try { const o = await api.get<Ov>('/admin/overview'); setOv(o); setBudget(String(o.ai.config.budget_paise / 100)); setReports(await api.get('/admin/reports')); setUsers(await api.get('/admin/users')); } catch (e) { setMsg({ tone: 'error', text: err(e) }); }
    // eslint-disable-next-line
  }, []);
  useEffect(() => { if (me?.profile.role === 'admin') void load(); }, [me, load]);
  if (me?.profile.role !== 'admin') return <Navigate to="/" replace />;
  const run = (key: string, fn: () => Promise<unknown>, okText?: string) => async () => {
    if (['activate', 'deactivate', 'budget'].includes(key) && arm !== key) { setArm(key); return; }   // two taps for paid-AI controls
    setArm(null);
    try { const r: any = await fn(); setMsg({ tone: 'ok', text: okText ?? (r?.bot ? `OK ${r.bot}` : r?.ok === true ? 'OK' : t('ad.done')) }); await load(); } catch (e) { setMsg({ tone: 'error', text: err(e) }); }
  };
  const c = ov?.ai.config; const st = ov?.ai.status;
  return (
    <div className="space-y-4">
      <PageTitle title={t('ad.title')} />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {ov && c && st && <>
        <section className="card space-y-3"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-lg text-crimson">{t('ad.budget')}</h2><Badge tone={st.mode === 'live' ? 'ok' : 'gold'}>{st.mode === 'live' ? t('ad.live') : t('ad.demo')}</Badge><span className="text-xs text-charcoal/70">{st.reason}</span></div>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><div><dt className="label">{t('ad.budget')}</dt><dd className="font-bold">{rs(c.budget_paise)}</dd></div><div><dt className="label">{t('ad.spent')}</dt><dd className="font-bold">{rs(c.spent_paise)}</dd></div>
            <div><dt className="label">{t('ad.reserved')}</dt><dd className="font-bold">{rs(c.reserved_paise)}</dd></div><div><dt className="label">{t('ad.left')}</dt><dd className="font-bold text-ok">{rs(st.remaining_paise)}</dd></div></dl>
          {st.expires_at && <p className="text-sm">{t('ad.expires')}: <b>{new Date(st.expires_at).toLocaleString()}</b></p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={st.mode === 'live'} onClick={run('activate', () => api.post('/admin/ai/activate'))}>{arm === 'activate' ? t('ad.confirm') : t('ad.activate')}</button>
            <button className="btn-secondary" disabled={st.mode !== 'live'} onClick={run('deactivate', () => api.post('/admin/ai/deactivate'))}>{arm === 'deactivate' ? t('ad.confirm') : t('ad.deactivate')}</button></div>
          <div className="flex flex-wrap items-end gap-2"><Field label={t('ad.setBudget')}><input className="input !w-32" type="number" min={0} max={1000} step="0.5" value={budget} onChange={e => setBudget(e.target.value)} /></Field>
            <button className="btn-secondary" onClick={run('budget', () => api.put('/admin/ai/budget', { budget_inr: Number(budget) }))}>{arm === 'budget' ? t('ad.confirm') : t('ad.setBudget')}</button></div>
          <p className="text-xs text-charcoal/70">{t('ad.note')}</p></section>
        <section className="card space-y-2"><h2 className="font-display text-lg text-crimson">{t('ad.services')}</h2>
          <p className="flex flex-wrap gap-1">{Object.entries(ov.services).map(([k, v]) => <Badge key={k} tone={v ? 'ok' : 'gray'}>{k}: {v ? 'configured' : 'not configured'}</Badge>)}</p>
          <p className="text-xs">{Object.entries(ov.ai.models).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
          <div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={run('sarvam', () => api.post('/admin/sarvam/test'))}>{t('ad.testSarvam')}</button><button className="btn-secondary" onClick={run('demoreset', () => api.post('/admin/demo/reset'))}>{t('ad.demoReset')}</button><button className="btn-secondary" onClick={run('tg', () => api.post('/admin/telegram/test'))}>{t('ad.testTelegram')}</button></div></section>
        <section className="card"><h2 className="font-display text-lg text-crimson">{t('ad.ledger')}</h2><div className="overflow-x-auto"><table className="mt-1 w-full text-left text-xs"><tbody>{ov.ledger.map(l => <tr key={l.id} className="border-t border-gold/30"><td className="py-1 pr-2">{new Date(l.created_at).toLocaleString()}</td><td className="pr-2">{l.operation}</td><td className="pr-2">{l.status}</td><td className="pr-2">{rs(l.actual_paise ?? l.estimated_paise)}</td></tr>)}</tbody></table></div></section>
        <section className="card space-y-1"><h2 className="font-display text-lg text-crimson">{t('ad.reports')}</h2><ul className="space-y-1 text-sm">{reports.map(r => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-gold/30 py-1"><span className="min-w-0">{r.category} · {r.area_label ?? ''} <Badge tone={r.status === 'hidden' ? 'red' : 'gray'}>{r.status}</Badge></span>
          <button className="btn-ghost !min-h-[36px] text-xs" onClick={run('r' + r.id, () => api.post(`/admin/reports/${r.id}/${r.status === 'hidden' ? 'unhide' : 'hide'}`))}>{r.status === 'hidden' ? t('ad.unhide') : t('ad.hide')}</button></li>)}</ul></section>
        <section className="card"><h2 className="font-display text-lg text-crimson">{t('ad.users')} ({ov.counts.users})</h2><ul className="mt-1 space-y-1 text-sm">{users.map(u => <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-gold/30 py-1"><span>{u.display_name} · {u.age_group} · {u.role}</span>
          {u.photo_status === 'pending' && <span className="flex gap-1"><button className="btn-ghost !min-h-[36px] text-xs" onClick={run('p' + u.id, () => api.post(`/admin/users/${u.id}/photo`, { status: 'approved' }))}>Approve photo</button><button className="btn-ghost !min-h-[36px] text-xs !text-vermilion" onClick={run('q' + u.id, () => api.post(`/admin/users/${u.id}/photo`, { status: 'rejected' }))}>Reject</button></span>}</li>)}</ul></section>
        <section className="card"><h2 className="font-display text-lg text-crimson">{t('ad.audit')}</h2><ul className="mt-1 text-xs">{ov.audit.map((a, i) => <li key={i}>{new Date(a.created_at).toLocaleString()} · {a.action}</li>)}</ul></section></>}
    </div>
  );
}
