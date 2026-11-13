import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Navigation } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { Notice, Toggle } from './ui';

interface Peer { user_id: string; name: string; lat: number; lng: number; seconds_ago: number }

/** Share my live location with the people in this accepted walk, and see theirs. Off by default; stops when switched off or unmounted. */
export function LiveShare({ journeyId }: { journeyId: string }) {
  const { t, err } = useI18n();
  const [on, setOn] = useState(false); const [peers, setPeers] = useState<Peer[]>([]); const [mine, setMine] = useState<[number, number] | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const el = useRef<HTMLDivElement>(null); const map = useRef<L.Map | null>(null); const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!on) return;
    let dead = false, last = 0;
    if (!navigator.geolocation) { setMsg(t('map.locDenied')); setOn(false); return; }
    const watch = navigator.geolocation.watchPosition(p => {
      setMine([p.coords.latitude, p.coords.longitude]);
      if (Date.now() - last > 8000) { last = Date.now(); api.post(`/journeys/${journeyId}/location`, { lat: p.coords.latitude, lng: p.coords.longitude }).catch(e => { if (!dead) { setMsg(err(e)); setOn(false); } }); }
    }, () => { setMsg(t('map.locDenied')); setOn(false); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    return () => { dead = true; navigator.geolocation.clearWatch(watch); void api.del(`/journeys/${journeyId}/location`).catch(() => undefined); };
  }, [on, journeyId, err, t]);

  useEffect(() => {
    if (!on) { setPeers([]); return; }
    let dead = false;
    const poll = () => api.get<Peer[]>(`/journeys/${journeyId}/locations`).then(x => { if (!dead) setPeers(x); }).catch(e => { if (!dead) setMsg(err(e)); });
    void poll(); const i = setInterval(poll, 8000); return () => { dead = true; clearInterval(i); };
  }, [on, journeyId, err]);

  useEffect(() => {
    if (!on || !el.current) return;
    const m = L.map(el.current, { center: mine ?? [22.5726, 88.3639], zoom: 15 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m);
    map.current = m; layer.current = L.layerGroup().addTo(m); setTimeout(() => m.invalidateSize(), 100);
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);
  useEffect(() => {
    const g = layer.current, m = map.current; if (!g || !m) return; g.clearLayers(); const pts: [number, number][] = [];
    if (mine) { L.circleMarker(mine, { radius: 9, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).bindTooltip(t('walk.you')).addTo(g); pts.push(mine); }
    for (const p of peers) { const c: [number, number] = [p.lat, p.lng]; L.circleMarker(c, { radius: 10, color: '#fff', weight: 3, fillColor: '#711B27', fillOpacity: 1 }).bindTooltip(`${p.name} · ${t('walk.peerSeen', { s: p.seconds_ago })}`, { permanent: true, direction: 'top' }).addTo(g); pts.push(c); }
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 17 }); else if (pts.length === 1) m.setView(pts[0], 16);
  }, [peers, mine, t]);

  return (
    <div className="space-y-2 rounded-2xl border border-gold/60 bg-gradient-to-b from-white to-champagne p-3">
      <div className="flex items-center gap-2"><Navigation className="h-5 w-5 text-crimson" aria-hidden /><h4 className="font-display text-base text-crimson">{t('walk.shareTitle')}</h4></div>
      <p className="text-xs text-charcoal/75">{t('walk.shareBody')}</p>
      <Toggle label={on ? t('walk.shareOn') : t('walk.shareOff')} checked={on} onChange={v => { setMsg(null); setOn(v); }} />
      {msg && <Notice tone="error">{msg}</Notice>}
      {on && <><div ref={el} className="h-64 w-full rounded-xl border border-gold/60" role="application" aria-label="Walk map" />{peers.length === 0 && <p className="text-xs text-charcoal/70">{t('walk.noPeers')}</p>}</>}
    </div>
  );
}
