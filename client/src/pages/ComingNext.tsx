import { Eye, Radar, Store, Brain } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { Badge, PageTitle } from '../components/ui';
import type { Key } from '../locales';

const ITEMS: { id: string; icon: typeof Eye }[] = [
  { id: 'stalk', icon: Radar }, { id: 'watch', icon: Eye },
  { id: 'havens', icon: Store }, { id: 'intel', icon: Brain },
];
/** Planned features only: deliberately NO buttons, so nothing pretends to work. */
export default function ComingNext() {
  const { t } = useI18n();
  return (
    <div>
      <PageTitle title={t('next.title')} sub={t('next.intro')} />
      <ul className="grid gap-4 md:grid-cols-2">
        {ITEMS.map(i => (
          <li key={i.id} className="card border-dashed">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-champagne text-crimson"><i.icon className="h-5 w-5" aria-hidden /></span>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-lg text-crimson">{t(`next.${i.id}.t` as Key)}</h2><Badge>{t('common.planned')}</Badge></div>
                <p className="mt-1 text-sm text-charcoal/80">{t(`next.${i.id}.d` as Key)}</p></div>
            </div>
          </li>))}
      </ul>
    </div>
  );
}
