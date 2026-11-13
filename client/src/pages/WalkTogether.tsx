import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, MapPin, Search, ShieldAlert } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useAlert } from '../lib/alert';
import { Badge, Field, Notice, PageTitle } from '../components/ui';
import { PersonCardView } from '../components/PersonCardView';
import { LiveShare } from '../components/LiveShare';
import { TrustPassPanel, useTrustPasses, verifiedFor } from '../components/TrustPass';
import type { PersonCard } from '../lib/types';
import type { Key } from '../locales';

interface Disc { id: string; origin_label: string; destination_label: string; depart_at: string; meeting_point_label: string; owner_label: string; owner: PersonCard; spots_left: number; my_request: { id: string; status: string } | null }
interface Mine { id: string; origin_label: string; destination_label: string; depart_at: string; meeting_point_label: string; status: 'open' | 'cancelled' | 'ended'; my_role: 'owner' | 'companion' | null; my_request_status: string | null;
  people: { user_id: string; role: string; label: string; person: PersonCard }[]; pending_requests: { id: string; requester_id: string; message: string | null; label: string; person: PersonCard }[] }
const REASONS = ['harassment', 'unsafe_behaviour', 'fake_profile', 'other'] as const;
const localIn = (ms: number) => { const d = new Date(Date.now() + ms - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

export default function WalkTogether() {
  const { me } = useAuth(); const { t, err, lang } = useI18n(); const { trigger } = useAlert();
  const [tab, setTab] = useState<'discover' | 'mine' | 'create'>('discover');
  const [disc, setDisc] = useState<Disc[]>([]); const [mine, setMine] = useState<Mine[]>([]);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState({ origin: '', dest: '', meeting: '', when: localIn(3600_000), max: 2 });
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [reqMsg, setReqMsg] = useState<Record<string, string>>({});
  const tps = useTrustPasses(tab === 'mine');
  const [reporting, setReporting] = useState<{ journey: string; user: string } | null>(null);
  const [reason, setReason] = useState<(typeof REASONS)[number]>('harassment');
  const when = (iso: string) => new Date(iso).toLocaleString(lang === 'en' ? 'en-IN' : lang === 'hi' ? 'hi-IN' : 'bn-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const locked = me?.profile.age_group === 'teen' && !me.profile.guardian_consent;
  const pr = me?.profile; const incomplete = !!pr && (!pr.age || !pr.profession || !pr.gender_declared || (pr.age_group === 'adult' && (pr.photo_status ?? 'none') === 'none'));
  const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const shown = disc.filter(j => !search.trim() || norm(j.destination_label).includes(norm(search)) || norm(search).includes(norm(j.destination_label)));
  const ok = (text: string) => setMsg({ tone: 'ok', text }); const bad = (e: unknown) => setMsg({ tone: 'error', text: err(e) });

  const load = useCallback(async () => {
    try { const [d, m] = await Promise.all([api.get<Disc[]>('/journeys/discover'), api.get<Mine[]>('/journeys/mine')]); setDisc(d); setMine(m); } catch (e) { bad(e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void load(); }, [load]);
  const act = (fn: () => Promise<unknown>, done?: string) => async () => { try { await fn(); if (done) ok(done); await load(); } catch (e) { bad(e); } };

  const create = async () => {
    if (busy) return;                                                       // ignore double taps
    const t0 = new Date(form.when).getTime(); if (!form.when || !(t0 > Date.now() - 300000 && t0 < Date.now() + 7 * 86400000)) { setMsg({ tone: 'error', text: t('walk.pastTime') }); return; }
    setBusy(true); setMsg(null);
    try { await api.post('/journeys', { origin_label: form.origin.trim(), destination_label: form.dest.trim(), meeting_point_label: form.meeting.trim(), depart_at: new Date(form.when).toISOString(), max_companions: form.max }); ok(t('common.saved')); setTab('mine'); await load(); } catch (e) { bad(e); } finally { setBusy(false); }
  };
  // The result of a tap must be visible where the finger is: on a phone the top of the page is off screen.
  useEffect(() => { if (msg && tab === 'create') document.getElementById('walk-msg')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [msg, tab]);
  const sendReport = async () => { if (!reporting) return; try { await api.post('/user-reports', { reported_user_id: reporting.user, journey_id: reporting.journey, reason }); ok(t('walk.reported')); setReporting(null); } catch (e) { bad(e); } };

  return (
    <div className="space-y-4">
      <PageTitle title={t('walk.title')} sub={t('walk.intro')} />
      <div className="card flex flex-wrap items-center gap-3 !border-vermilion/50 !bg-vermilion/5">
        <ShieldAlert className="h-6 w-6 text-vermilion" aria-hidden /><div className="min-w-0 flex-1"><b className="text-vermilion">{t('walk.exit')}</b><p className="text-sm">{t('walk.exitBody')}</p></div>
        <button className="btn-danger" onClick={() => trigger('manual', 'live')}>SOS</button></div>
      {locked && <Notice tone="warn">{t('walk.lock')}</Notice>}
      {incomplete && <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gold bg-gradient-to-r from-gold/30 to-champagne p-3 text-sm shadow-sm"><span className="min-w-0 flex-1 font-semibold text-crimson">{t('pf.ctaBody')}</span><Link to="/profile-setup" className="btn-primary !min-h-[40px]">{t('pf.cta')}</Link></div>}
      {pr?.verification_status !== 'verified' && <Notice>{t('walk.notVerified')}</Notice>}
      {msg && tab !== 'create' && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-champagne p-1" role="tablist">{(['discover', 'mine', 'create'] as const).map(k => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-[44px] rounded-lg text-sm font-semibold ${tab === k ? 'bg-crimson text-ivory' : 'text-crimson'}`}>{t(k === 'discover' ? 'walk.discover' : k === 'mine' ? 'walk.mine' : 'walk.create')}</button>)}</div>

      {tab === 'create' && (
        <section className="card space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('walk.origin')}><input className="input" maxLength={80} value={form.origin} onChange={e => setForm({ ...form, origin: e.target.value })} /></Field>
            <Field label={t('walk.dest')}><input className="input" maxLength={80} value={form.dest} onChange={e => setForm({ ...form, dest: e.target.value })} /></Field>
            <Field label={t('walk.meeting')}><input className="input" maxLength={100} value={form.meeting} onChange={e => setForm({ ...form, meeting: e.target.value })} /></Field>
            <Field label={t('walk.time')}><input className="input" type="datetime-local" value={form.when} onChange={e => setForm({ ...form, when: e.target.value })} /></Field>
            <Field label={t('walk.max')}><select className="input" value={form.max} onChange={e => setForm({ ...form, max: Number(e.target.value) })}>{[1, 2, 3].filter(n => me?.profile.age_group !== 'teen' || n <= 2).map(n => <option key={n}>{n}</option>)}</select></Field></div>
          {(() => { const missing = form.origin.trim().length < 2 || form.dest.trim().length < 2 || form.meeting.trim().length < 2; return (<>
            {missing && !locked && <p className="text-xs font-semibold text-crimson">{t('walk.fillAll')}</p>}
            <button className="btn-primary w-full sm:w-auto" disabled={locked || missing || busy} onClick={() => void create()}>{busy ? t('common.loading') : t('walk.publish')}</button></>); })()}
          <div id="walk-msg" role="status" aria-live="polite">{msg && tab === 'create' && <Notice tone={msg.tone}>{msg.text}</Notice>}</div>
          {incomplete && <Link to="/profile-setup" className="btn-secondary w-full text-center sm:w-auto">{t('pf.cta')}</Link>}
          <p className="text-xs text-charcoal/70">{t('walk.noLoc')}</p></section>)}

      {tab === 'discover' && (<div className="space-y-3">
        <div className="card space-y-2"><Field label={t('walk.searchTo')} hint={t('walk.searchHelp')}><span className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-crimson/60" aria-hidden /><input className="input !pl-10" value={search} maxLength={80} onChange={e => setSearch(e.target.value)} /></span></Field>
          {search.trim() && <p className="text-sm font-semibold text-crimson">{t('walk.matches', { n: shown.length })}</p>}</div>
      {shown.length === 0 ? <p className="card text-sm">{t('walk.none')}</p> : (
        <ul className="grid gap-3 md:grid-cols-2">{shown.map(j => (
          <li key={j.id} className="card card-link space-y-3"><div className="flex flex-wrap items-start justify-between gap-2"><PersonCardView p={j.owner} /><Badge>{t('walk.spots', { n: j.spots_left })}</Badge></div>
            <p className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-crimson" />{j.origin_label} → {j.destination_label}</p>
            <p className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4 text-crimson" />{when(j.depart_at)}</p><p className="text-sm">{t('walk.meeting')}: <b>{j.meeting_point_label}</b></p>
            {j.my_request && j.my_request.status !== 'cancelled' ? <Badge tone={j.my_request.status === 'accepted' ? 'ok' : j.my_request.status === 'declined' ? 'red' : 'gray'}>{t('walk.requested')}: {j.my_request.status}</Badge> : (
              <div className="space-y-2"><input className="input" placeholder={t('walk.message')} maxLength={200} value={reqMsg[j.id] ?? ''} onChange={e => setReqMsg({ ...reqMsg, [j.id]: e.target.value })} />
                <button className="btn-primary w-full" disabled={locked || j.spots_left < 1} onClick={act(() => api.post(`/journeys/${j.id}/requests`, { message: reqMsg[j.id] || undefined }), t('walk.requested'))}>{t('walk.request')}</button></div>)}
          </li>))}</ul>)}</div>)}

      {tab === 'mine' && (mine.length === 0 ? <p className="card text-sm">{t('walk.none')}</p> : (
        <ul className="space-y-3">{mine.map(j => (
          <li key={j.id} className="card space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><b>{j.origin_label} → {j.destination_label}</b><Badge tone={j.status === 'open' ? 'ok' : 'gray'}>{t(`walk.st.${j.status}` as Key)}</Badge></div>
            <p className="text-sm">{when(j.depart_at)} · {t('walk.meeting')}: <b>{j.meeting_point_label}</b></p>
            {j.my_role === null && j.my_request_status && <Badge>{t('walk.requested')}: {j.my_request_status}</Badge>}
            {j.my_role && (<div><h3 className="text-sm font-semibold text-crimson">{t('walk.people')}</h3><ul className="text-sm">{j.people.map(p => (
              <li key={p.user_id} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span className="min-w-0">{p.label === 'You' ? <>{p.label} <span className="text-xs text-charcoal/70">({t(p.role === 'owner' ? 'walk.host' : 'walk.companion')})</span></> : <PersonCardView p={p.person} size={52} />}</span>
                {p.label !== 'You' && <span className="flex gap-1"><button className="btn-ghost !min-h-[36px] !px-2 text-xs" onClick={() => setReporting({ journey: j.id, user: p.user_id })}>{t('walk.report')}</button>
                  <button className="btn-ghost !min-h-[36px] !px-2 text-xs !text-vermilion" onClick={act(() => api.post('/blocks', { user_id: p.user_id, journey_id: j.id }), t('walk.blocked'))}>{t('walk.block')}</button></span>}</li>))}</ul></div>)}
            {j.pending_requests.length > 0 && (<div><h3 className="text-sm font-semibold text-crimson">{t('walk.pending')}</h3><ul className="space-y-2">{j.pending_requests.map(r => (
              <li key={r.id} className="rounded-xl bg-champagne p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-3"><span className="min-w-0"><PersonCardView p={r.person} />{r.message && <span className="mt-1 block text-charcoal/80">“{r.message}”</span>}</span>
                <span className="flex gap-1"><button className="btn-primary !min-h-[40px]" onClick={act(() => api.post(`/journeys/${j.id}/requests/${r.id}/accept`))}>{t('walk.accept')}</button><button className="btn-secondary !min-h-[40px]" onClick={act(() => api.post(`/journeys/${j.id}/requests/${r.id}/decline`))}>{t('walk.decline')}</button>
                  <button className="btn-ghost !min-h-[40px] text-xs" onClick={() => setReporting({ journey: j.id, user: r.requester_id })}>{t('walk.report')}</button></span></div></li>))}</ul></div>)}
            {j.my_role && j.status === 'open' && j.people.length > 1 && (me?.profile.age_group === 'teen' ? <p className="text-xs text-charcoal/70">{t('walk.teenNoLive')} {t('tp.teenNote')}</p> : <>
              <TrustPassPanel journeyId={j.id} isOwner={j.my_role === 'owner'} onChange={tps.reload} />
              {verifiedFor(tps.list, j.id) ? <LiveShare journeyId={j.id} /> : <p className="text-xs text-charcoal/70">{t('err.TRUSTPASS_REQUIRED')}</p>}</>)}
            <div className="flex flex-wrap gap-2">
              {j.my_role === 'owner' && j.status === 'open' && <button className="btn-secondary" onClick={act(() => api.post(`/journeys/${j.id}/cancel`))}>{t('walk.cancelJ')}</button>}
              {j.my_role === 'owner' && j.status === 'open' && <button className="btn-primary" onClick={act(() => api.post(`/journeys/${j.id}/end`))}>{t('walk.endJ')}</button>}
              {j.my_role === 'companion' && j.status === 'open' && <button className="btn-secondary" onClick={act(() => api.post(`/journeys/${j.id}/leave`))}>{t('walk.leave')}</button>}
              {j.my_request_status === 'pending' && <button className="btn-ghost" onClick={act(async () => { /* cancel my own pending request */ const r = disc.find(d => d.id === j.id)?.my_request; if (r) await api.post(`/journeys/${j.id}/requests/${r.id}/cancel`); })}>{t('common.cancel')}</button>}
            </div></li>))}</ul>))}

      {reporting && (<div className="card space-y-3 !border-crimson"><h3 className="font-semibold text-crimson">{t('walk.report')}</h3>
        <select className="input" value={reason} onChange={e => setReason(e.target.value as (typeof REASONS)[number])}>{REASONS.map(r => <option key={r} value={r}>{t(`walk.reason.${r}` as Key)}</option>)}</select>
        <div className="flex gap-2"><button className="btn-primary" onClick={() => void sendReport()}>{t('common.send')}</button><button className="btn-ghost" onClick={() => setReporting(null)}>{t('common.cancel')}</button></div></div>)}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card"><h2 className="font-display text-lg text-crimson">{t('walk.rem')}</h2><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{(['walk.rem1', 'walk.rem2', 'walk.rem3', 'walk.rem4'] as const).map(k => <li key={k}>{t(k)}</li>)}</ul></div>
        <div className="card space-y-2"><h2 className="font-display text-lg text-crimson">{t('walk.teen')}</h2><p className="text-sm"><Badge tone="ok">✓</Badge> {t('walk.teenImpl')}</p><p className="text-sm"><Badge tone="gray">✗</Badge> {t('walk.teenReal')}</p></div>
      </section>
    </div>
  );
}
