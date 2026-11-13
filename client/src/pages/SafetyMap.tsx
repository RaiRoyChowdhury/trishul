import { useOnline } from '../lib/online';
import { enqueue } from '../lib/localStore';
import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { LocateFixed, Route as RouteIcon, MapPinPlus, TriangleAlert, ShieldCheck, FlaskConical, Radio } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { Badge, Field, Notice, PageTitle } from '../components/ui';
import { type MapHandle } from '../components/MapView';
import { deleteTiles, MAX_SAVE_TILES, saveTiles, savedTileCount, tilesFor } from '../lib/tiles';
import { MapView, isPositive, markerStyle, type Haven, type Rep, type RouteOut, type Zone } from '../components/MapView';
import type { Key } from '../locales';

const CATS = ['harassment', 'poor_lighting', 'isolated_area', 'unsafe_transport', 'suspicious_activity', 'road_hazard', 'improved_lighting', 'positive'] as const;
const KOLKATA: [number, number] = [22.5726, 88.3639];
type Verdict = 'clear' | 'avoid' | 'reduce' | 'none';
interface RouteResp { direct: RouteOut; safe: RouteOut | null; verdict: Verdict; zones: Zone[]; minPeople: number; synthetic: boolean; extraKm: number; extraMinutes: number }
// Built-in demo trip (Sealdah to Esplanade). The 10 sample reports on the server are placed along it.
const DEMO_FROM: [number, number] = [22.5675, 88.3700], DEMO_TO: [number, number] = [22.5646, 88.3510];
const km = (m: number) => (m / 1000).toFixed(1);

function Dot({ r }: { r: Pick<Rep, 'category' | 'reliability'> }) {
  const o = markerStyle(r);
  return <span className="inline-block h-4 w-4 shrink-0 rounded-full align-middle" style={{ background: `${o.fillColor}${Math.round((o.fillOpacity ?? 1) * 255).toString(16).padStart(2, '0')}`, border: `${o.weight}px ${o.dashArray ? 'dashed' : 'solid'} ${o.color}` }} />;
}

export default function SafetyMap() {
  const { t, err, lang } = useI18n();
  const [reports, setReports] = useState<Rep[]>([]); const [havens, setHavens] = useState<Haven[]>([]);
  const [cat, setCat] = useState(''); const [days, setDays] = useState(90);
  const [split, setSplit] = useState(false);
  const [mode, setMode] = useState<'report' | 'route'>('report');
  const [pending, setPending] = useState<[number, number] | null>(null); const [dest, setDest] = useState<[number, number] | null>(null);
  const [userPos, setUserPos] = useState<[number, number] | null>(null); const [locMsg, setLocMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ category: 'poor_lighting', description: '', area: '' });
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [route, setRoute] = useState<RouteResp | null>(null);
  const mapHandle = useRef<MapHandle | null>(null); const [tiles, setTiles] = useState<{ saved: number; busy: string | null }>({ saved: 0, busy: null });
  useEffect(() => { void savedTileCount().then(n => setTiles(s => ({ ...s, saved: n }))).catch(() => undefined); }, []);
  const saveArea = async () => {
    const b = mapHandle.current?.bounds(); if (!b) return; const { urls, truncated } = tilesFor({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }, [14, 15]);
    setTiles(s => ({ ...s, busy: `0/${urls.length}` }));
    try { await saveTiles(urls, n => setTiles(s => ({ ...s, busy: `${n}/${urls.length}` }))); setTiles({ saved: await savedTileCount(), busy: null }); setMsg({ tone: 'info', text: t('off.mapSaved', { n: urls.length }) + (truncated ? ' ' + t('off.mapCapped', { n: MAX_SAVE_TILES }) : '') }); } catch { setTiles(s => ({ ...s, busy: null })); setMsg({ tone: 'error', text: t('off.mapFail') }); }
  };
  const [loading, setLoading] = useState(true); const [cachedAt, setCachedAt] = useState<number | null>(null); const { online } = useOnline();
  const [zones, setZones] = useState<Zone[]>([]); const [minPeople, setMinPeople] = useState(4); const [updated, setUpdated] = useState<Date | null>(null);
  const [from, setFrom] = useState<[number, number] | null>(null); const [pick, setPick] = useState<'from' | 'to'>('to'); const [demoTrip, setDemoTrip] = useState(false); const [finding, setFinding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getMeta<Rep[]>(`/reports?days=${days}${cat ? `&category=${cat}` : ''}`); setCachedAt(r.cachedAt);
      // Saved (offline) copies are NEVER shown as verified or current: every marker is downgraded to "unverified".
      setReports(r.cachedAt ? r.data.map(x => ({ ...x, reliability: 'unverified' as const })) : r.data); setMsg(null);
    } catch (e) { setMsg({ tone: 'error', text: `${t('map.loadFail')} ${err(e)}` }); }
    finally { setLoading(false); }
  }, [days, cat, err, t]);
  useEffect(() => { void load(); }, [load]);
  // Live map: refresh reports and danger zones every 15 seconds while the tab is visible.
  const loadZones = useCallback(async () => { try { const zr = await api.getMeta<{ zones: Zone[]; minPeople: number }>('/zones'); const z = zr.data; if (zr.cachedAt) setCachedAt(c => c ?? zr.cachedAt); setZones(z.zones); setMinPeople(z.minPeople); setUpdated(new Date()); } catch { /* keep the last zones */ } }, []);
  useEffect(() => { void loadZones(); }, [loadZones, reports]);
  useEffect(() => {
    const i = setInterval(() => { if (document.visibilityState === 'visible' && online) { void api.get<Rep[]>(`/reports?days=${days}${cat ? `&category=${cat}` : ''}`).then(setReports).catch(() => undefined); } }, 15000);
    return () => clearInterval(i);
  }, [days, cat, online]);
  useEffect(() => { const h = () => void load(); window.addEventListener('trishul-reports-synced', h); return () => window.removeEventListener('trishul-reports-synced', h); }, [load]);
  useEffect(() => { if (online) void load(); /* eslint-disable-next-line */ }, [online]);
  useEffect(() => { api.get<Haven[]>('/havens').then(setHavens).catch(() => setHavens([])); }, []);

  const locate = () => {
    setLocMsg(null);
    if (!navigator.geolocation) { setLocMsg(t('map.locDenied')); return; }
    navigator.geolocation.getCurrentPosition(p => { const pos: [number, number] = [p.coords.latitude, p.coords.longitude]; setUserPos(pos); if (mode === 'route') { setFrom(pos); setDemoTrip(false); setRoute(null); setPick('to'); } }, () => setLocMsg(t('map.locDenied')), { timeout: 8000 });
  };
  const demo = () => { setMode('route'); setFrom(DEMO_FROM); setDest(DEMO_TO); setDemoTrip(true); setRoute(null); setMsg(null); };
  const onClick = useCallback((lat: number, lng: number) => { if (mode === 'report') { setPending([lat, lng]); return; } setRoute(null); setDemoTrip(false); if (pick === 'from') { setFrom([lat, lng]); setPick('to'); } else setDest([lat, lng]); }, [mode, pick]);
  const labels = useCallback((r: Rep) => ({ title: t(`cat.${r.category}` as Key), meta: `${r.sample ? `${t('mp.sample')} · ` : ''}${t(`rel.${r.reliability}` as Key)} · ${new Date(r.occurred_at).toLocaleDateString(lang === 'en' ? 'en-IN' : lang === 'hi' ? 'hi-IN' : 'bn-IN')}` }), [t, lang]);
  const havenLabel = useCallback((h: Haven) => (h.verification_status === 'verified' ? t('rel.verified') : t('map.havenUnverified')), [t]);

  const submit = async () => {
    if (!pending) { setMsg({ tone: 'info', text: t('map.pickSpot') }); return; }
    try { await api.post('/reports', { category: form.category, description: form.description || undefined, area_label: form.area || undefined, lat: pending[0], lng: pending[1] }); setPending(null); setForm({ ...form, description: '' }); setMsg({ tone: 'ok', text: t('map.submitted') }); await load(); }
    catch (e) {
      if (e instanceof ApiError && e.code === 'NETWORK') {   // offline: keep the report on this phone with the time it really happened
        try { await enqueue('report', { category: form.category, description: form.description || undefined, area_label: form.area || undefined, lat: pending[0], lng: pending[1], occurred_at: new Date().toISOString() }); window.dispatchEvent(new Event('trishul-queue')); setPending(null); setForm({ ...form, description: '' }); setMsg({ tone: 'info', text: t('off.reportQueued') }); return; } catch { /* fall through */ }
      }
      setMsg({ tone: 'error', text: err(e) });
    }
  };
  const feedback = async (id: string, kind: 'inaccurate' | 'outdated' | 'confirm') => {
    try { await api.post(`/reports/${id}/feedback`, { kind }); setMsg({ tone: 'ok', text: t('map.feedbackSaved') }); await load(); } catch (e) { setMsg({ tone: 'error', text: err(e) }); }
  };
  const compare = async () => {
    if (!from || !dest) return; setRoute(null); setFinding(true);
    try { setRoute(await api.get<RouteResp>(`/route?from=${from[0]},${from[1]}&to=${dest[0]},${dest[1]}${demoTrip ? '&demo=1' : ''}`)); setMsg(null); } catch (e) { setMsg({ tone: 'error', text: `${t('map.routeFail')} (${err(e)})` }); }
    finally { setFinding(false); }
  };
  const catList = useCallback((z: Zone) => Object.entries(z.categories).map(([c, n]) => `${t(`cat.${c}` as Key)} ×${n}`).join(', '), [t]);
  const zoneLabel = useCallback((z: Zone) => `${t('mp.zoneLabel', { n: z.people })}: ${catList(z)}`, [t, catList]);
  const zoneById = (id: string) => route?.zones.find(z => z.id === id);
  const sorted = useMemo(() => reports.slice(0, 40), [reports]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><PageTitle title={t('map.title')} />
        <span className="chip !border-ok/40 !bg-ok/10 !text-ok" role="status"><Radio className="h-3.5 w-3.5 animate-pulse" aria-hidden />{t('mp.live')}{updated ? ` · ${updated.toLocaleTimeString()}` : ''}</span></div>
      <Notice tone="warn">{t('map.disclaimer')}</Notice>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1"><Field label={t('map.filterCat')}><select className="input" value={cat} onChange={e => setCat(e.target.value)}><option value="">{t('map.all')}</option>{CATS.map(c => <option key={c} value={c}>{t(`cat.${c}` as Key)}</option>)}</select></Field></div>
            <div className="w-36"><Field label={t('map.recency')}><select className="input" value={days} onChange={e => setDays(Number(e.target.value))}>{[7, 30, 90].map(d => <option key={d} value={d}>{t('map.days', { n: d })}</option>)}</select></Field></div>
            <button className="btn-secondary" onClick={locate}><LocateFixed className="h-4 w-4" />{t('map.loc')}</button>
          </div>
          {locMsg && <Notice>{locMsg}</Notice>}
          {cachedAt && <Notice tone="warn">{t('off.cachedAt', { time: new Date(cachedAt).toLocaleString() })}</Notice>}
          {route && route.safe && route.verdict !== 'clear' && <button className="btn-secondary w-full" onClick={() => setSplit(s => !s)} aria-pressed={split}>{t(split ? 'mp.oneMap' : 'mp.twoMaps')}</button>}
          {split && route?.safe ? (
            <div className="grid gap-3 md:grid-cols-2">
              <figure className="space-y-1"><figcaption className="rounded-lg bg-[#C0392B] px-3 py-1.5 text-sm font-bold text-white">{t('mp.red')} · {km(route.direct.distance)} {t('map.km')}</figcaption>
                <MapView compact center={userPos ?? KOLKATA} reports={reports} havens={[]} userPos={userPos} pending={null} dest={dest} from={from} direct={route.direct} safe={null} zones={route.zones} zoneLabel={zoneLabel} onMapClick={() => undefined} labels={labels} havenLabel={havenLabel} /></figure>
              <figure className="space-y-1"><figcaption className="rounded-lg bg-[#1F8A4C] px-3 py-1.5 text-sm font-bold text-white">{t('mp.green')} · {km(route.safe.distance)} {t('map.km')}</figcaption>
                <MapView compact center={userPos ?? KOLKATA} reports={reports} havens={[]} userPos={userPos} pending={null} dest={dest} from={from} direct={null} safe={route.safe} zones={route.zones} zoneLabel={zoneLabel} onMapClick={() => undefined} labels={labels} havenLabel={havenLabel} /></figure>
            </div>
          ) : (
            <MapView handle={mapHandle} center={userPos ?? KOLKATA} reports={reports} havens={havens} userPos={userPos} pending={pending} dest={dest} from={mode === 'route' ? from : null} direct={route?.direct ?? null} safe={route?.safe ?? null} zones={route?.zones ?? zones} zoneLabel={zoneLabel} onMapClick={onClick} labels={labels} havenLabel={havenLabel} />
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs"><button className="btn-secondary !min-h-[40px]" disabled={!online || !!tiles.busy || split} onClick={() => void saveArea()}>{tiles.busy ? `${t('off.mapSaving')} ${tiles.busy}` : t('off.mapSave')}</button>
            {tiles.saved > 0 && <><span>{t('off.mapCount', { n: tiles.saved })}</span><button className="btn-ghost !min-h-[40px]" onClick={async () => { await deleteTiles(); setTiles(s => ({ ...s, saved: 0 })); }}>{t('off.mapDelete')}</button></>}</div>
          <p className="text-xs text-charcoal/70" aria-live="polite">{loading ? t('common.loading') : t('map.count', { n: reports.length })}</p>
          <section className="card" aria-label={t('map.legend')}><h2 className="mb-2 font-semibold text-crimson">{t('map.legend')}</h2>
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
              <li className="flex items-center gap-2"><Dot r={{ category: 'harassment', reliability: 'unverified' }} />{t('map.lg.hazard')}</li>
              <li className="flex items-center gap-2"><Dot r={{ category: 'positive', reliability: 'unverified' }} />{t('map.lg.positive')}</li>
              <li className="flex items-center gap-2"><Dot r={{ category: 'harassment', reliability: 'corroborated' }} />{t('map.lg.corroborated')}</li>
              <li className="flex items-center gap-2"><Dot r={{ category: 'harassment', reliability: 'verified' }} />{t('map.lg.verified')}</li>
              <li className="flex items-center gap-2"><span className="h-4 w-4 rounded-full border-2 border-vermilion bg-vermilion/25" />{t('mp.lg.zone', { n: minPeople })}</li>
              <li className="flex items-center gap-2"><span className="h-1.5 w-6 rounded bg-[#C0392B]" />{t('mp.red')}</li>
              <li className="flex items-center gap-2"><span className="h-1.5 w-6 rounded bg-[#1F8A4C]" />{t('mp.green')}</li>
              <li className="flex items-center gap-2"><span className="grid h-4 w-4 place-items-center rounded-sm border-2 border-gold bg-ivory text-[9px] font-bold text-crimson">H</span>{t('map.lg.haven')}</li>
              <li className="flex items-center gap-2"><span className="h-4 w-4 rounded-full border-2 border-white bg-blue-600 shadow" />{t('map.lg.you')}</li></ul></section>
        </div>

        <aside className="space-y-3">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-champagne p-1" role="tablist">
            <button role="tab" aria-selected={mode === 'report'} onClick={() => setMode('report')} className={`min-h-[44px] rounded-lg text-sm font-semibold ${mode === 'report' ? 'bg-crimson text-ivory' : 'text-crimson'}`}><MapPinPlus className="mr-1 inline h-4 w-4" />{t('map.report')}</button>
            <button role="tab" aria-selected={mode === 'route'} onClick={() => setMode('route')} className={`min-h-[44px] rounded-lg text-sm font-semibold ${mode === 'route' ? 'bg-crimson text-ivory' : 'text-crimson'}`}><RouteIcon className="mr-1 inline h-4 w-4" />{t('map.route')}</button></div>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          {mode === 'report' ? (
            <section className="card space-y-3"><p className="text-sm">{t('map.reportHint')}</p>
              <Field label={t('map.filterCat')}><select className="input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATS.map(c => <option key={c} value={c}>{t(`cat.${c}` as Key)}</option>)}</select></Field>
              <Field label={t('map.desc')}><textarea className="input" rows={3} maxLength={500} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
              <button className="btn-primary w-full" onClick={() => void submit()}>{t('map.submit')}</button>{!pending && <p className="text-xs text-charcoal/70">{t('map.pickSpot')}</p>}</section>
          ) : (
            <div className="space-y-3">
              <section className="card space-y-3">
                <p className="text-sm">{t('mp.help')}</p>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('map.route')}>
                  {(['from', 'to'] as const).map(k => { const set = k === 'from' ? !!from : !!dest; return (
                    <button key={k} type="button" aria-pressed={pick === k} onClick={() => setPick(k)} className={`rounded-xl border p-2 text-left text-sm transition ${pick === k ? 'border-crimson bg-crimson/5 ring-2 ring-crimson/40' : 'border-gold/50 bg-white'}`}>
                      <span className="block text-xs font-bold uppercase tracking-wide text-crimson">{t(k === 'from' ? 'mp.start' : 'mp.dest')}</span>
                      <span className={set ? 'font-semibold text-ok' : 'text-charcoal/60'}>{set ? '✓ ' + t('mp.set') : t('mp.tapMap')}</span></button>); })}
                </div>
                <div className="flex flex-wrap gap-2"><button className="btn-secondary !min-h-[40px] flex-1" onClick={locate}><LocateFixed className="h-4 w-4" />{t('mp.useMe')}</button>
                  <button className="btn-secondary !min-h-[40px] flex-1" onClick={demo}><FlaskConical className="h-4 w-4" />{t('mp.demoTrip')}</button></div>
                <button className="btn-primary w-full" disabled={!from || !dest || finding} onClick={() => void compare()}><RouteIcon className="h-5 w-5" />{finding ? t('mp.finding') : t('mp.find')}</button>
                <p className="text-xs text-charcoal/70">{t('mp.rule', { m: minPeople })}</p>
              </section>
              {route && (<div className="space-y-3" aria-live="polite">
                {route.synthetic && <Notice tone="warn">{t('mp.synthetic')}</Notice>}
                {route.verdict === 'avoid' && route.safe && <div className="flex items-start gap-2 rounded-2xl bg-ok p-3 text-sm font-semibold text-white shadow-md"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />{t('mp.recommend', { x: route.extraKm.toFixed(1), n: route.direct.zoneIds.length })}</div>}
                {route.verdict === 'clear' && <Notice tone="ok">{t('mp.clear')}</Notice>}
                {route.verdict === 'none' && <Notice tone="warn">{t('mp.noSafe')}</Notice>}
                {route.verdict === 'reduce' && <Notice tone="warn">{t('mp.reduce')}</Notice>}
                {route.verdict !== 'clear' && (
                  <article className="rounded-2xl border-2 border-[#C0392B]/70 bg-[#C0392B]/5 p-4 shadow-card">
                    <div className="flex items-center justify-between gap-2"><span className="chip !border-[#C0392B]/40 !bg-[#C0392B] !text-white"><TriangleAlert className="h-3.5 w-3.5" aria-hidden />{t('mp.red')}</span>
                      <span className="text-right font-display text-xl text-[#9d2b20]">{km(route.direct.distance)} {t('map.km')}<span className="block text-xs font-sans font-semibold text-charcoal/70">{Math.round(route.direct.duration / 60)} {t('map.min')}</span></span></div>
                    <p className="mt-2 text-sm font-semibold">{t('mp.redWhy', { n: route.direct.zoneIds.length })}</p>
                    <ul className="mt-1 space-y-1.5 text-sm">{route.direct.zoneIds.map(id => { const z = zoneById(id); return z ? <li key={id} className="rounded-lg bg-white/80 p-2"><b>{t('mp.people', { n: z.people })}</b><div className="text-xs text-charcoal/80">{catList(z)}</div>{z.sample && <div className="text-[11px] font-semibold text-crimson">{t('mp.sample')}</div>}</li> : null; })}</ul>
                    <p className="mt-2 text-xs text-charcoal/75">{t('mp.redAdvice')}</p>
                  </article>)}
                {(route.safe || route.verdict === 'clear') && (() => { const g = route.safe ?? route.direct; return (
                  <article className="rounded-2xl border-2 border-[#1F8A4C]/70 bg-[#1F8A4C]/5 p-4 shadow-card">
                    <div className="flex items-center justify-between gap-2"><span className="chip !border-[#1F8A4C]/40 !bg-[#1F8A4C] !text-white"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />{t('mp.green')}</span>
                      <span className="text-right font-display text-xl text-[#166a3a]">{km(g.distance)} {t('map.km')}<span className="block text-xs font-sans font-semibold text-charcoal/70">{Math.round(g.duration / 60)} {t('map.min')}</span></span></div>
                    <p className="mt-2 text-sm font-semibold">{g.zoneIds.length === 0 ? t('mp.greenWhy0', { m: minPeople }) : t('mp.greenWhyFew', { a: g.zoneIds.length, b: route.direct.zoneIds.length })}</p>
                    {route.verdict !== 'clear' && route.safe && <p className="mt-1 text-sm">{t('mp.longer', { x: route.extraKm.toFixed(1), m: route.extraMinutes })}</p>}
                    <p className="mt-2 text-xs text-charcoal/75">{t('mp.greenAdvice')}</p>
                  </article>); })()}
                <p className="text-xs font-semibold">{t('map.routeNoGuarantee')}</p></div>)}
            </div>)}
          <section className="card"><h2 className="mb-1 font-semibold text-crimson">{t('map.havens')}</h2>
            {havens.length === 0 ? <p className="text-sm text-charcoal/80">{t('map.havensEmpty')}</p> : <ul className="space-y-1 text-sm">{havens.map(h => <li key={h.id} className="flex items-center justify-between gap-2"><span>{h.name}</span><Badge tone={h.verification_status === 'verified' ? 'ok' : 'gray'}>{havenLabel(h)}</Badge></li>)}</ul>}</section>
        </aside>
      </div>

      <section className="card"><h2 className="mb-2 font-display text-lg text-crimson">{t('map.title')}</h2>
        {sorted.length === 0 ? <p className="text-sm text-charcoal/70">{loading ? t('common.loading') : t('walk.none')}</p> : (
          <ul className="divide-y divide-gold/30">{sorted.map(r => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Dot r={r} /><b>{t(`cat.${r.category}` as Key)}</b><Badge tone={r.reliability === 'verified' ? 'ok' : r.reliability === 'disputed' ? 'red' : 'gray'}>{t(`rel.${r.reliability}` as Key)}</Badge>{isPositive(r.category) && <Badge tone="ok">+</Badge>}</div>
                {r.description && <p className="mt-0.5 break-words">{r.description}</p>}<p className="text-xs text-charcoal/70">{t('map.occurred')}: {new Date(r.occurred_at).toLocaleDateString()}</p></div>
              {r.sample ? <Badge tone="gray">{t('mp.sample')}</Badge> : <div className="flex flex-wrap gap-1">{(['confirm', 'inaccurate', 'outdated'] as const).map(k => <button key={k} className="btn-ghost !min-h-[40px] !px-2 text-xs" onClick={() => void feedback(r.id, k)}>{t(k === 'confirm' ? 'map.confirm' : k === 'inaccurate' ? 'map.flagInaccurate' : 'map.flagOutdated')}</button>)}</div>}</li>))}</ul>)}</section>
    </div>
  );
}
