import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { TILE_URL } from '../lib/tiles';

export interface Rep { id: string; category: string; description: string | null; lat: number; lng: number; area_label: string | null; occurred_at: string; reliability: 'unverified' | 'corroborated' | 'verified' | 'disputed'; corroboration_count: number; flag_count: number; sample?: boolean }
export interface Zone { id: string; lat: number; lng: number; radiusM: number; people: number; reports: number; categories: Record<string, number>; sample: boolean }
export interface Haven { id: string; name: string; kind: string; address: string | null; lat: number; lng: number; verification_status: string }
export interface RouteOut { distance: number; duration: number; coordinates: [number, number][]; zoneIds: string[] }
const POSITIVE = new Set(['positive', 'improved_lighting']);
export const isPositive = (c: string) => POSITIVE.has(c);

/** Marker look encodes meaning: hollow+dashed = unverified, filled = more support, gold ring = verified. */
export function markerStyle(r: Pick<Rep, 'category' | 'reliability'>): L.CircleMarkerOptions {
  const col = r.reliability === 'disputed' ? '#7a7373' : isPositive(r.category) ? '#2F6B4F' : '#B83A32';
  if (r.reliability === 'verified') return { radius: 10, color: '#C9A45C', weight: 4, fillColor: col, fillOpacity: 0.95 };
  if (r.reliability === 'corroborated') return { radius: 9, color: col, weight: 2, fillColor: col, fillOpacity: 0.5 };
  return { radius: 9, color: col, weight: 2, dashArray: '3 3', fillColor: col, fillOpacity: 0.12 };
}

export interface MapHandle { bounds: () => L.LatLngBounds | null }
interface Props {
  handle?: { current: MapHandle | null };
  center: [number, number]; reports: Rep[]; havens: Haven[]; userPos: [number, number] | null; pending: [number, number] | null; dest: [number, number] | null;
  direct: RouteOut | null; safe: RouteOut | null; zones: Zone[]; zoneLabel: (z: Zone) => string; from: [number, number] | null; onMapClick: (lat: number, lng: number) => void; labels: (r: Rep) => { title: string; meta: string }; havenLabel: (h: Haven) => string; compact?: boolean;
}
export function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null); const map = useRef<L.Map | null>(null);
  const layers = useRef<{ reps: L.LayerGroup; havens: L.LayerGroup; pts: L.LayerGroup; routes: L.LayerGroup; zones: L.LayerGroup } | null>(null);
  const click = useRef(p.onMapClick); click.current = p.onMapClick;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { center: p.center, zoom: 13 });
    L.tileLayer(TILE_URL, { maxZoom: 19, crossOrigin: true, attribution: '© OpenStreetMap contributors' }).addTo(m);
    layers.current = { zones: L.layerGroup().addTo(m), routes: L.layerGroup().addTo(m), reps: L.layerGroup().addTo(m), havens: L.layerGroup().addTo(m), pts: L.layerGroup().addTo(m) };
    m.on('click', (e: L.LeafletMouseEvent) => click.current(e.latlng.lat, e.latlng.lng));
    map.current = m; if (p.handle) p.handle.current = { bounds: () => m.getBounds() }; setTimeout(() => m.invalidateSize(), 100);
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const g = layers.current?.reps; if (!g) return; g.clearLayers();
    for (const r of p.reports) {
      const cm = L.circleMarker([r.lat, r.lng], markerStyle(r));
      const { title, meta } = p.labels(r);
      const box = document.createElement('div'); const b = document.createElement('b'); b.textContent = title; const sm = document.createElement('div'); sm.textContent = meta; box.append(b, sm);
      if (r.description) { const d = document.createElement('div'); d.textContent = r.description; box.append(d); }   // textContent: user text can never inject HTML
      cm.bindPopup(box); cm.addTo(g);
    }
  }, [p.reports, p.labels]);

  useEffect(() => {
    const g = layers.current?.havens; if (!g) return; g.clearLayers();
    for (const h of p.havens) {
      const icon = L.divIcon({ className: '', html: `<div style="width:22px;height:22px;border-radius:5px;background:#F5EBDD;border:3px solid #C9A45C;color:#711B27;font:700 12px/16px sans-serif;text-align:center;opacity:${h.verification_status === 'verified' ? 1 : 0.6}">H</div>`, iconSize: [22, 22] });
      const m = L.marker([h.lat, h.lng], { icon }); const box = document.createElement('div'); const b = document.createElement('b'); b.textContent = h.name; const s = document.createElement('div'); s.textContent = p.havenLabel(h); box.append(b, s); m.bindPopup(box).addTo(g);
    }
  }, [p.havens, p.havenLabel]);

  useEffect(() => {
    const g = layers.current?.pts; if (!g) return; g.clearLayers();
    if (p.userPos) L.circleMarker(p.userPos, { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(g);
    if (p.from) L.circleMarker(p.from, { radius: 10, color: '#fff', weight: 3, fillColor: '#1d4ed8', fillOpacity: 1 }).addTo(g);
    if (p.pending) L.circleMarker(p.pending, { radius: 11, color: '#711B27', weight: 3, fillColor: '#C9A45C', fillOpacity: 0.8 }).addTo(g);
    if (p.dest) L.circleMarker(p.dest, { radius: 10, color: '#292323', weight: 3, fillColor: '#fff', fillOpacity: 1 }).addTo(g);
  }, [p.userPos, p.pending, p.dest, p.from]);

  useEffect(() => {
    const g = layers.current?.zones; if (!g) return; g.clearLayers();
    for (const z of p.zones) L.circle([z.lat, z.lng], { radius: z.radiusM, color: '#B83A32', weight: 2, fillColor: '#B83A32', fillOpacity: 0.22 }).bindTooltip(p.zoneLabel(z), { direction: 'top' }).addTo(g);
  }, [p.zones, p.zoneLabel]);

  useEffect(() => {
    const g = layers.current?.routes; if (!g) return; g.clearLayers();
    const ll = (r: RouteOut) => r.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
    if (p.direct) L.polyline(ll(p.direct), { color: '#C0392B', weight: 6, opacity: 0.9, dashArray: p.safe && !p.compact ? '10 8' : undefined }).addTo(g);
    if (p.safe) L.polyline(ll(p.safe), { color: '#1F8A4C', weight: 7, opacity: 0.95 }).addTo(g);
    const all = [...(p.direct ? ll(p.direct) : []), ...(p.safe ? ll(p.safe) : [])];
    if (all.length && map.current) map.current.fitBounds(L.latLngBounds(all), { padding: [30, 30] });
  }, [p.direct, p.safe]);

  useEffect(() => { if (p.userPos && map.current) map.current.setView(p.userPos, Math.max(map.current.getZoom(), 14)); }, [p.userPos]);
  return <div ref={el} className={`w-full rounded-2xl border border-gold/60 shadow-card ${p.compact ? 'h-[46vh] min-h-[300px] md:h-[60vh]' : 'h-[56vh] min-h-[340px] md:h-[70vh] lg:h-[74vh]'}`} role="application" aria-label="Map" />;
}
