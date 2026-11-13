import { BadgeCheck, Briefcase, GraduationCap, Home, UserRound } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import type { PersonCard } from '../lib/types';
import type { Key } from '../locales';
import { Avatar } from './Avatar';

const ICON = { student: GraduationCap, working: Briefcase, homemaker: Home, self_employed: Briefcase, other: UserRound } as const;

/** Who a walker is: photo, age, profession (a student is clearly labelled), workplace or college, and ID-verification status. */
export function PersonCardView({ p, size = 64 }: { p: PersonCard; size?: number }) {
  const { t } = useI18n(); const Ico = p.profession ? ICON[p.profession] : UserRound;
  return (
    <div className="flex items-start gap-3">
      <Avatar userId={p.id} name={p.name} show={p.has_photo} size={size} />
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><b className="font-display text-lg leading-tight text-crimson">{p.name}</b>
          <span className="text-sm text-charcoal/80">{p.age !== null ? t('pf.ageYears', { n: p.age }) : t('pf.under18')}</span></div>
        {p.profession && <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${p.profession === 'student' ? 'bg-gold/30 text-crimson' : 'bg-champagne text-charcoal'}`}><Ico className="h-3.5 w-3.5" aria-hidden />{t(`pf.prof.${p.profession}` as Key)}</div>}
        {p.organisation && <p className="text-sm text-charcoal/80">{p.organisation}</p>}
        {p.verified ? <div className="inline-flex items-center gap-1 text-xs font-bold text-ok"><BadgeCheck className="h-4 w-4" aria-hidden />{t('pf.verified')}</div>
          : <div className="text-xs text-charcoal/60">{p.demo_account ? t('pf.demoAcct') : t('pf.notVerified')}</div>}
      </div>
    </div>
  );
}
