import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Footprints, Hand, KeyRound, Map as MapIcon, Phone, Sparkles, Users, MapPin, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useAlert } from '../lib/alert';
import { api } from '../lib/api';
import { Badge, Notice } from '../components/ui';
import { SetupBanner } from '../components/SetupBanner';
import type { Key } from '../locales';

interface J { id: string; origin_label: string; destination_label: string; depart_at: string; status: string }

export default function Dashboard() {
  const { me } = useAuth(); const { t, lang } = useI18n(); const { trigger, armed, cooldown } = useAlert();
  const [contacts, setContacts] = useState<number | null>(null);
  const [journeys, setJourneys] = useState<J[] | null>(null);
  const { health } = useAuth(); const [ai, setAi] = useState<'live' | 'demo' | null>(null);
  useEffect(() => { api.get<{ mode: 'live' | 'demo' }>('/ai/status').then(r => setAi(r.mode)).catch(() => setAi(null)); }, []);
  useEffect(() => {
    api.get<unknown[]>('/contacts').then(c => setContacts(c.length)).catch(() => setContacts(null));
    api.get<J[]>('/journeys/mine').then(setJourneys).catch(() => setJourneys(null));
  }, []);
  if (!me) return null;
  const { profile, settings: s } = me;
  const tiles: { to: string; icon: typeof Phone; k: Key }[] = [
    { to: '/call', icon: Phone, k: 'nav.call' }, { to: '/map', icon: MapIcon, k: 'nav.map' }, { to: '/sos', icon: KeyRound, k: 'nav.sos' },
    { to: '/walk', icon: Footprints, k: 'nav.walk' }, { to: '/no-touch', icon: Hand, k: 'nav.noTouch' }, { to: '/settings', icon: ShieldCheck, k: 'nav.settings' },
  ];
  const ntState = !s.nt_enabled ? t('common.off') : armed.nt ? t('nt.armed') : t('common.on');
  return (
    <div className="space-y-4">
      <section className="hero animate-fade-up">
        <p className="chip text-gold-light"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />TRISHUL</p>
        <h1 className="mt-3 font-display text-2xl leading-snug sm:text-4xl">{t('home.greeting', { name: profile.display_name })}</h1>
        <p className="mt-2 max-w-xl text-ivory/85">{t('home.stay')}</p>
      </section>
      <SetupBanner />
      <section aria-label={t('home.notices')} className="space-y-2">
        {profile.verification_status === 'test_account' && <Notice>{t('home.testNotice')}</Notice>}
        {profile.age_group === 'teen' && !profile.guardian_consent && <Notice tone="warn">{t('home.teenLock')}</Notice>}
        {!s.location_consent && <Notice>{t('home.locationOff')}</Notice>}
        {(!profile.age || !profile.profession || !profile.gender_declared) && <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gold bg-gradient-to-r from-gold/30 to-champagne p-3 text-sm shadow-sm"><span className="min-w-0 flex-1 font-semibold text-crimson">{t('pf.ctaBody')}</span><Link to="/profile-setup" className="btn-primary !min-h-[40px]">{t('pf.cta')}</Link></div>}
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <button onClick={() => trigger('manual', 'live')} className="card card-link flex items-center gap-4 text-left md:col-span-3 !border-gold/60 !bg-gradient-to-r !from-crimson-light !via-crimson !to-crimson-dark !text-ivory shadow-lift">
          <span className="grid h-16 w-16 shrink-0 animate-ring-pulse place-items-center rounded-full bg-ivory text-xl font-bold text-crimson ring-4 ring-gold">SOS</span>
          <span><span className="block font-display text-xl">{t('home.needHelp')}</span><span className="text-sm opacity-90">{cooldown > 0 ? t('nt.cooling', { n: cooldown }) : t('home.tapSos')}</span></span>
        </button>
        <section className="card md:col-span-2" aria-label={t('home.quick')}>
          <h2 className="mb-3 font-display text-lg text-crimson">{t('home.quick')}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {tiles.map(x => <Link key={x.to} to={x.to} className="card-link flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-gradient-to-b from-white to-champagne p-2 text-center text-sm font-semibold text-crimson shadow-sm"><span className="icon-chip"><x.icon className="h-5 w-5" aria-hidden /></span>{t(x.k)}</Link>)}
          </div>
        </section>
        <section className="card space-y-3" aria-label={t('home.status')}>
          <h2 className="font-display text-lg text-crimson">{t('home.status')}</h2>
          <p className="text-sm text-charcoal/80">{t('home.statusOk')}</p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Users className="h-4 w-4 text-crimson" />{contacts === null ? '…' : contacts ? t('home.contacts', { n: contacts }) : t('home.contactsNone')}</span><Link to="/settings" className="text-crimson underline">{t('common.setup')}</Link></li>
            <li className="flex items-center justify-between gap-2"><span>{t('home.sosPhrase')}</span><Badge tone={s.sos_phrase_hash ? 'ok' : 'gray'}>{s.sos_phrase_hash ? t('home.set') : t('home.notSet')}</Badge></li>
            <li className="flex items-center justify-between gap-2"><span>{t('home.tg')}</span><Badge tone={health && health !== 'down' && health.services.telegram ? 'ok' : 'gray'}>{health && health !== 'down' && health.services.telegram ? t('home.configured') : t('home.notConfigured')}</Badge></li>
            <li className="flex items-center justify-between gap-2"><span>{t('home.ai')}</span><Badge tone={ai === 'live' ? 'ok' : 'gold'}>{ai === 'live' ? t('ad.live') : ai === 'demo' ? t('ad.demo') : '…'}</Badge></li>
            <li className="flex items-center justify-between gap-2"><span>{t('home.locShare')}</span><Badge tone={s.location_consent ? 'ok' : 'gray'}>{s.location_consent ? t('common.on') : t('common.off')}</Badge></li>
            <li className="flex items-center justify-between gap-2"><span>{t('nav.noTouch')}</span><Badge tone={s.nt_enabled ? 'ok' : 'gray'}>{ntState}</Badge></li>
          </ul>
        </section>
      </div>

      <section className="card" aria-label={t('home.recent')}>
        <h2 className="mb-2 font-display text-lg text-crimson">{t('home.recent')}</h2>
        {!journeys?.length ? <p className="text-sm text-charcoal/70">{t('home.noJourneys')}</p> : (
          <ul className="divide-y divide-gold/30">{journeys.slice(0, 3).map(j => (
            <li key={j.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span className="flex min-w-0 items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-crimson" /><span className="truncate">{j.origin_label} → {j.destination_label}</span></span>
              <span className="shrink-0 text-xs text-charcoal/70">{new Date(j.depart_at).toLocaleString(lang === 'en' ? 'en-IN' : lang === 'hi' ? 'hi-IN' : 'bn-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></li>))}</ul>)}
      </section>
      <Link to="/next" className="card card-link flex items-center gap-3"><Sparkles className="h-5 w-5 text-gold" /><span className="font-semibold text-crimson">{t('nav.next')}</span><Badge>{t('common.planned')}</Badge></Link>
    </div>
  );
}
