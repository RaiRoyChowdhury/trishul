import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { QrCode, ScanLine, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useOnline } from '../lib/online';
import { useI18n } from '../lib/i18n';
import { Badge, Notice } from './ui';
import { PersonCardView } from './PersonCardView';
import type { PersonCard } from '../lib/types';
import type { Key } from '../locales';

export interface TpView { id: string; journey_id: string; request_id: string; role: 'issuer' | 'scanner'; state: 'awaiting_scan' | 'qr_expired' | 'awaiting_confirm' | 'waiting_other' | 'verified' | 'cancelled'; expires_at: string }
const tone = (s: TpView['state']) => (s === 'verified' ? 'ok' : s === 'qr_expired' || s === 'cancelled' ? 'red' : 'gold') as 'ok' | 'red' | 'gold';

/** Shared state: the list of my TrustPasses (polled while the panel is open). */
export function useTrustPasses(active = true) {
  const [list, setList] = useState<TpView[]>([]);
  const load = useCallback(async () => { try { setList(await api.get<TpView[]>('/trustpass/mine')); } catch { /* shown elsewhere */ } }, []);
  useEffect(() => { if (!active) return; void load(); const i = setInterval(() => void load(), 3000); return () => clearInterval(i); }, [active, load]);
  return { list, reload: load };
}
export const verifiedFor = (list: TpView[], journeyId: string) => list.some(x => x.journey_id === journeyId && x.state === 'verified');

/** Host: shows a QR for one accepted companion. Companion: scans it. Then both confirm. */
export function TrustPassPanel({ journeyId, isOwner, onChange }: { journeyId: string; isOwner: boolean; onChange?: () => void }) {
  const { t, err } = useI18n(); const { list, reload } = useTrustPasses(); const { online } = useOnline();
  const [accepted, setAccepted] = useState<{ request_id: string; person: PersonCard }[]>([]);
  const [qr, setQr] = useState<{ request_id: string; url: string; expires: number } | null>(null); const [left, setLeft] = useState(0);
  const [msg, setMsg] = useState<string | null>(null); const [host, setHost] = useState<PersonCard | null>(null);
  const [scanning, setScanning] = useState(false); const [code, setCode] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const mine = list.filter(x => x.journey_id === journeyId);
  useEffect(() => { if (isOwner) api.get<typeof accepted>(`/trustpass/accepted/${journeyId}`).then(setAccepted).catch(() => setAccepted([])); }, [isOwner, journeyId, list.length]);
  useEffect(() => { if (!qr) return; const i = setInterval(() => { const s = Math.max(0, Math.round((qr.expires - Date.now()) / 1000)); setLeft(s); if (!s) setQr(null); }, 500); return () => clearInterval(i); }, [qr]);
  useEffect(() => { if (mine.some(x => x.state === 'verified')) { setQr(null); onChange?.(); } /* eslint-disable-next-line */ }, [list]);

  const show = async (request_id: string) => {
    setMsg(null);
    try { const r = await api.post<{ payload: string; expires_at: string }>('/trustpass/issue', { journey_id: journeyId, request_id }); setQr({ request_id, url: await QRCode.toDataURL(r.payload, { margin: 1, width: 280 }), expires: Date.parse(r.expires_at) }); void reload(); }
    catch (e) { setMsg(err(e)); }
  };
  const submit = async (payload: string) => {
    setMsg(null); setScanning(false);
    try { const r = await api.post<{ person: PersonCard }>('/trustpass/scan', { payload }); setHost(r.person); setCode(''); void reload(); } catch (e) { setMsg(err(e)); }
  };
  const confirm = async (id: string) => { try { await api.post(`/trustpass/${id}/confirm`); void reload(); } catch (e) { setMsg(err(e)); } };

  // Camera scan: native BarcodeDetector when present, otherwise jsQR on video frames. Falls back to typing the code.
  useEffect(() => {
    if (!scanning) return; let stop = false, stream: MediaStream | null = null, raf = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const v = video.current; if (!v) return; v.srcObject = stream; await v.play();
        const BD = (window as any).BarcodeDetector; const det = BD ? new BD({ formats: ['qr_code'] }) : null; const cv = document.createElement('canvas');
        const tick = async () => {
          if (stop) return;
          try {
            let val: string | null = null;
            if (det) { const f = await det.detect(v); val = f[0]?.rawValue ?? null; }
            else if (v.videoWidth) { cv.width = v.videoWidth; cv.height = v.videoHeight; const c = cv.getContext('2d')!; c.drawImage(v, 0, 0); const d = c.getImageData(0, 0, cv.width, cv.height); val = jsQR(d.data, d.width, d.height)?.data ?? null; }
            if (val?.startsWith('TP1.')) { void submit(val); return; }
          } catch { /* keep trying */ }
          raf = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch { setMsg(t('tp.noCamera')); setScanning(false); }
    })();
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach(x => x.stop()); };
    // eslint-disable-next-line
  }, [scanning]);

  return (
    <div className="space-y-3 rounded-2xl border border-gold bg-champagne/60 p-3">
      <h3 className="flex items-center gap-2 font-semibold text-crimson"><ShieldCheck className="h-5 w-5" aria-hidden />{t('tp.title')}</h3>
      <p className="text-xs text-charcoal/80">{t('tp.intro')}</p>
      {!online && <Notice tone="warn">{t('off.tpOffline')}</Notice>}
      {msg && <Notice tone="error">{msg}</Notice>}
      {mine.map(x => (
        <div key={x.id} className="flex flex-wrap items-center gap-2 text-sm"><Badge tone={tone(x.state)}>{t(`tp.state.${x.state}` as Key)}</Badge>
          {x.state === 'awaiting_confirm' && <button className="btn-primary !min-h-[40px]" disabled={!online} onClick={() => void confirm(x.id)}>{t('tp.confirm')}</button>}</div>))}
      {isOwner && <ul className="space-y-2">{accepted.map(a => (
        <li key={a.request_id} className="flex flex-wrap items-center justify-between gap-2"><PersonCardView p={a.person} size={48} />
          <button className="btn-secondary !min-h-[40px]" disabled={!online} onClick={() => void show(a.request_id)}><QrCode className="h-4 w-4" />{t('tp.show')}</button></li>))}</ul>}
      {qr && <div className="flex flex-col items-center gap-1"><img src={qr.url} alt="TrustPass QR" className="h-56 w-56 rounded-xl bg-white p-2 shadow" /><p className="text-xs" aria-live="polite">{t('tp.expiresIn', { n: left })}</p></div>}
      {!isOwner && <div className="space-y-2">
        {host && <div className="rounded-xl bg-white/70 p-2"><PersonCardView p={host} size={52} /></div>}
        <button className="btn-secondary" disabled={!online} onClick={() => setScanning(s => !s)}><ScanLine className="h-4 w-4" />{t('tp.scan')}</button>
        {scanning && <video ref={video} className="w-full max-w-xs rounded-xl bg-black" muted playsInline />}
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void submit(code.trim()); }}><input className="input" aria-label={t('tp.paste')} placeholder={t('tp.paste')} value={code} onChange={e => setCode(e.target.value)} maxLength={200} /><button className="btn-primary" disabled={!code.trim() || !online}>{t('tp.submit')}</button></form></div>}
    </div>
  );
}
