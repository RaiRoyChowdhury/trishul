import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, Map as MapIcon, Phone, Footprints, Settings, ShieldAlert, Hand, Sparkles, KeyRound, Network, Archive, FlaskConical, Settings2, LogOut, Menu } from 'lucide-react';
import { Logo } from './Logo';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useAlert } from '../lib/alert';
import { OfflineBar } from './OfflineBar';
import { DemoStrip } from './DemoStrip';
import { LANGS } from '../locales';
import { api } from '../lib/api';
import type { Key } from '../locales';

const NAV: { to: string; icon: typeof Home; k: Key; end?: boolean }[] = [
  { to: '/', icon: Home, k: 'nav.home', end: true }, { to: '/call', icon: Phone, k: 'nav.call' }, { to: '/map', icon: MapIcon, k: 'nav.map' },
  { to: '/sos', icon: KeyRound, k: 'nav.sos' }, { to: '/walk', icon: Footprints, k: 'nav.walk' }, { to: '/no-touch', icon: Hand, k: 'nav.noTouch' },
  { to: '/shakti', icon: Network, k: 'nav.shakti' }, { to: '/vault', icon: Archive, k: 'nav.vault' }, { to: '/demo', icon: FlaskConical, k: 'nav.demo' },
  { to: '/settings', icon: Settings, k: 'nav.settings' }, { to: '/next', icon: Sparkles, k: 'nav.next' },
];
const MOBILE = ['/', '/map', '/walk'];

export function LangSwitch() {
  const { lang, setLang } = useI18n(); const { session, me, refreshMe } = useAuth();
  const pick = async (l: typeof lang) => { setLang(l); if (session && me) { try { await api.patch('/me/profile', { language: l }); await refreshMe(); } catch { /* language still changes locally */ } } };
  return (
    <div className="inline-flex rounded-full border border-gold/60 bg-white/80 p-0.5 shadow-sm" role="group" aria-label="Language">
      {LANGS.map(x => <button key={x.code} onClick={() => void pick(x.code)} aria-pressed={lang === x.code}
        className={`min-h-[36px] rounded-full px-3 text-sm font-semibold ${lang === x.code ? 'bg-crimson text-ivory shadow' : 'text-crimson hover:bg-champagne'}`}>{x.label}</button>)}
    </div>
  );
}

export function Layout() {
  const { t } = useI18n(); const { signOut, me } = useAuth(); const { trigger, cooldown } = useAlert(); const nav = useNavigate(); const loc = useLocation();
  // Onboarding: a new account is taken to profile setup once per browser session (age, profession, photo).
  useEffect(() => {
    const p = me?.profile; if (!p || loc.pathname !== '/') return;
    const done = !!p.age && !!p.profession && !!p.gender_declared && (p.age_group === 'teen' || (p.photo_status ?? 'none') !== 'none');
    let seen = false; try { seen = sessionStorage.getItem('trishul.profilePrompted') === '1'; } catch { /* private mode */ }
    if (!done && !seen) { try { sessionStorage.setItem('trishul.profilePrompted', '1'); } catch { /* ignore */ } nav('/profile-setup'); }
  }, [me, loc.pathname, nav]);
  const SosBtn = ({ cls }: { cls: string }) => (
    <button onClick={() => trigger('manual', 'live')} aria-label={t('home.tapSos')} className={`${cls} grid place-items-center rounded-full bg-gradient-to-br from-crimson-light to-crimson-dark text-ivory font-bold ring-4 ring-gold shadow-glow animate-ring-pulse active:scale-95`}>SOS</button>);
  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 lg:w-72 shrink-0 flex-col gap-4 bg-gradient-to-b from-crimson via-crimson to-crimson-dark p-4 text-ivory sticky top-0 h-screen shadow-2xl border-r border-gold/30">
        <div className="self-center rounded-3xl bg-ivory/5 p-2 ring-1 ring-gold/30"><Logo height={104} /></div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          {[...NAV, ...(me?.profile.role === 'admin' ? [{ to: '/admin', icon: Settings2, k: 'nav.admin' as Key }] : [])].map(n => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 min-h-[44px] font-semibold transition ${isActive ? 'bg-gradient-to-r from-gold to-gold-light text-crimson-dark shadow-md' : 'text-ivory/90 hover:bg-ivory/10 hover:translate-x-0.5'}`}>
              <n.icon className="h-5 w-5" aria-hidden />{t(n.k)}
            </NavLink>))}
        </nav>
        <div className="flex items-center gap-3">
          <button onClick={() => trigger('manual', 'live')} aria-label={t('home.tapSos')} className="grid h-16 w-16 place-items-center rounded-full bg-ivory text-lg font-bold text-crimson ring-4 ring-gold shadow-glow active:scale-95">SOS</button>
          <p className="text-xs opacity-90">{cooldown > 0 ? t('nt.cooling', { n: cooldown }) : t('home.needHelp')}</p>
        </div>
        <button onClick={() => void signOut()} className="btn-ghost !text-ivory hover:!bg-crimson-light justify-start"><LogOut className="h-5 w-5" />{t('common.signOut')}</button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-gold/30 bg-ivory/80 px-4 py-2 shadow-sm backdrop-blur-md md:static md:bg-transparent md:border-0 md:justify-end" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
          <div className="md:hidden"><Logo height={44} /></div>
          <LangSwitch />
        </header>
        <OfflineBar /><DemoStrip /><main className="alpana mx-auto w-full max-w-5xl flex-1 px-4 pb-4 pt-4 md:pb-10 md:px-8"><Outlet /></main>
        <footer className="px-4 pb-28 text-center text-xs text-charcoal/70 md:px-8 md:pb-4"><p className="hidden md:block">{t('app.disclaimer')}</p><p className="mt-1">© 2026 TRISHUL · Created by Rai Roy Chowdhury</p></footer>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-end rounded-t-3xl border-t border-gold/50 bg-ivory/90 shadow-[0_-8px_24px_-12px_rgba(113,27,39,0.35)] backdrop-blur-md md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="Main">
        {NAV.filter(n => MOBILE.includes(n.to)).slice(0, 2).map(n => <MItem key={n.to} n={n} />)}
        <div className="-mt-6 flex justify-center pb-1"><SosBtn cls="h-16 w-16 text-lg" /></div>
        {NAV.filter(n => MOBILE.includes(n.to)).slice(2).map(n => <MItem key={n.to} n={n} />)}
        <button onClick={() => nav('/more')} className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-semibold text-crimson"><Menu className="h-5 w-5" aria-hidden />{t('nav.more')}</button>
      </nav>
    </div>
  );
  function MItem({ n }: { n: (typeof NAV)[number] }) {
    return <NavLink to={n.to} end={n.end} className={({ isActive }) => `flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-semibold ${isActive ? 'text-crimson' : 'text-charcoal/60'}`}>
      <n.icon className="h-5 w-5" aria-hidden />{t(n.k)}</NavLink>;
  }
}
export { NAV };
export const SosIcon = ShieldAlert;
