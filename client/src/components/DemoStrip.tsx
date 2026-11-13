import { FlaskConical } from 'lucide-react';
import { useDemoMode } from '../lib/demoMode';
import { useI18n } from '../lib/i18n';
export function DemoStrip() {
  const { on } = useDemoMode(); const { t } = useI18n();
  if (!on) return null;
  return <div role="status" className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-gold px-3 py-1.5 text-center text-xs font-bold text-crimson-dark"><FlaskConical className="h-4 w-4 shrink-0" aria-hidden />{t('demo.banner')}</div>;
}
