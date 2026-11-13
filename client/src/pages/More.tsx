import { Link } from 'react-router-dom';
import { NAV } from '../components/Layout';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { LogOut, Settings2 } from 'lucide-react';
import { PageTitle } from '../components/ui';

export default function More() {
  const { t } = useI18n(); const { signOut, me } = useAuth();
  return (
    <div className="space-y-3">
      <PageTitle title={t('nav.more')} />
      <ul className="space-y-2">{[...NAV, ...(me?.profile.role === 'admin' ? [{ to: '/admin', icon: Settings2, k: 'nav.admin' as const }] : [])].filter(n => !['/', '/map', '/walk'].includes(n.to)).map(n => (
        <li key={n.to}><Link to={n.to} className="card flex min-h-[56px] items-center gap-3 font-semibold text-crimson"><n.icon className="h-5 w-5" />{t(n.k)}</Link></li>))}</ul>
      <button className="btn-secondary w-full" onClick={() => void signOut()}><LogOut className="h-5 w-5" />{t('common.signOut')}</button>
      <p className="text-xs text-charcoal/70">{t('app.disclaimer')}</p>
    </div>
  );
}
