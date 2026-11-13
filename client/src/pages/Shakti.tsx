import { useEffect, useState } from 'react';
import { Network } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useDemoMode, DEMO_VOLUNTEERS } from '../lib/demoMode';
import { Badge, Notice, PageTitle } from '../components/ui';
import type { Key } from '../locales';

interface V { id: string; display_name: string; area: string; verification_status: string; training_status: string; safeguarding_status: string; available: boolean; is_demo: boolean; bookable: boolean }
export default function Shakti() {
  const { t, err } = useI18n(); const demo = useDemoMode();
  const [rows, setRows] = useState<V[]>([]); const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  useEffect(() => { if (demo.on) { setRows(DEMO_VOLUNTEERS); return; } api.get<V[]>('/shakti/volunteers').then(r => setRows(r.filter(x => !x.is_demo))).catch(e => setMsg({ tone: 'error', text: err(e) })); /* eslint-disable-next-line */ }, [demo.on]);
  const request = async (v: V) => {
    if (demo.on || v.is_demo) { setMsg({ tone: 'ok', text: t('err.DEMO_VOLUNTEER') }); return; }
    try { await api.post('/shakti/requests', { volunteer_id: v.id }); setMsg({ tone: 'ok', text: t('sh.sent') }); } catch (e) { setMsg({ tone: 'error', text: err(e) }); }
  };
  const areas = [...new Set(rows.map(r => r.area))];
  return (
    <div className="space-y-4">
      <PageTitle title={t('sh.title')} sub={t('sh.intro')} />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {rows.length === 0 && <p className="card text-sm">{t('sh.none')}</p>}
      {areas.map(a => (
        <section key={a} className="space-y-2"><h2 className="font-display text-lg text-crimson">{t('sh.area')}: {a}</h2>
          <ul className="grid gap-3 md:grid-cols-2">{rows.filter(r => r.area === a).map(v => (
            <li key={v.id} className="card space-y-2"><div className="flex items-start gap-3"><span className="icon-chip"><Network className="h-5 w-5" aria-hidden /></span>
              <div className="min-w-0"><b>{v.display_name}</b><div className="mt-1 flex flex-wrap gap-1">{v.is_demo && <Badge tone="gold">{t('sh.demoTag')}</Badge>}
                <Badge tone={v.verification_status === 'verified' ? 'ok' : 'gray'}>{t(`sh.v.${v.verification_status}` as Key)}</Badge><Badge tone={v.training_status === 'completed' ? 'ok' : 'gray'}>{t(`sh.t.${v.training_status}` as Key)}</Badge><Badge tone={v.safeguarding_status === 'cleared' ? 'ok' : 'gray'}>{t(`sh.s.${v.safeguarding_status}` as Key)}</Badge></div></div></div>
              <button className="btn-secondary w-full" disabled={!v.bookable} onClick={() => void request(v)}>{v.bookable ? t('sh.request') : t('sh.notReady')}</button></li>))}</ul></section>))}
    </div>
  );
}
