import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useOnline } from '../lib/online';
import { Notice } from './ui';
import type { Key } from '../locales';

const ITEMS: [keyof import('../lib/types').Health['services'], Key][] = [['supabase', 'setup.supabase'], ['sarvam', 'setup.sarvam'], ['telegram', 'setup.telegram'], ['twilio', 'setup.twilio']];

export function SetupBanner() {
  const { health, configured } = useAuth();
  const { t } = useI18n();
  const { online } = useOnline();
  if (health === null || !online) return null;   // offline is explained by the status bar, not as a server problem
  if (health === 'down') return <Notice tone="error" title={t('setup.title')}>{t('setup.serverDown')}</Notice>;
  const missing = ITEMS.filter(([k]) => !health.services[k]);
  if (!missing.length && configured) return null;
  return (
    <Notice tone="warn" title={t('setup.title')}>
      <p>{t('setup.body')}</p>
      <ul className="mt-1 list-disc pl-5">
        {!configured && <li>Supabase (browser keys) — {t('setup.missing')}</li>}
        {missing.map(([k, key]) => <li key={k}>{t(key)} — {t('setup.missing')}</li>)}
      </ul>
      <p className="mt-1 text-xs">{t('setup.guide')}</p>
    </Notice>
  );
}
