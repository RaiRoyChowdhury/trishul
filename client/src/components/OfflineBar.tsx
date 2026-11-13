import { useCallback, useEffect, useState } from 'react';
import { CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { useOnline } from '../lib/online';
import { useI18n } from '../lib/i18n';
import { api, ApiError } from '../lib/api';
import { queueCount } from '../lib/localStore';
import { flushQueue } from '../lib/syncQueue';

/** Always-visible connection status. Also sends queued safety reports when the connection returns. */
export function OfflineBar() {
  const { net, online, checkNow } = useOnline(); const { t } = useI18n();
  const [waiting, setWaiting] = useState(0); const [syncing, setSyncing] = useState(false); const [note, setNote] = useState<string | null>(null);
  const refresh = useCallback(() => { void queueCount().then(setWaiting).catch(() => setWaiting(0)); }, []);
  useEffect(() => { refresh(); const i = setInterval(refresh, 4000); window.addEventListener('trishul-queue', refresh); return () => { clearInterval(i); window.removeEventListener('trishul-queue', refresh); }; }, [refresh]);
  useEffect(() => {
    if (net !== 'online') return; let dead = false; setSyncing(true);
    void flushQueue('report', async it => {
      try { await api.post('/reports', it.payload); return { ok: true }; }
      catch (e) { if (e instanceof ApiError && e.code !== 'NETWORK' && e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 401) return { ok: false, permanent: true, error: e.code }; return { ok: false, permanent: false, error: e instanceof ApiError ? e.code : 'ERR' }; }
    }).then(r => { if (!dead && r.sent.length) { setNote(t('off.synced', { n: r.sent.length })); window.dispatchEvent(new Event('trishul-reports-synced')); } }).finally(() => { if (!dead) { setSyncing(false); refresh(); } });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net]);
  useEffect(() => { if (!note) return; const i = setTimeout(() => setNote(null), 6000); return () => clearTimeout(i); }, [note]);
  if (online && !waiting && !note) return <div className="sr-only" role="status">{t('off.online')}</div>;
  return (
    <div role="status" aria-live="polite" className={`flex flex-wrap items-center justify-center gap-2 px-3 py-1.5 text-center text-xs font-semibold ${online ? 'bg-ok/15 text-ok' : 'bg-charcoal text-ivory'}`}>
      {online ? <Wifi className="h-4 w-4" aria-hidden /> : <CloudOff className="h-4 w-4" aria-hidden />}
      <span>{online ? (syncing ? t('off.syncing') : note ?? t('off.online')) : t('off.offline')}</span>
      {waiting > 0 && <span className="rounded-full bg-gold px-2 py-0.5 text-crimson-dark">{t('off.waiting', { n: waiting })}</span>}
      {!online && <button className="underline" onClick={checkNow}><RefreshCw className="mr-1 inline h-3 w-3" aria-hidden />{t('off.retry')}</button>}
    </div>
  );
}
