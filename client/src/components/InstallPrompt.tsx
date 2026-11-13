import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { useI18n } from '../lib/i18n';

/** Install button: uses the browser's install prompt where it exists (Android/desktop Chrome, Edge); shows the iPhone steps otherwise. Hidden once installed. */
export function InstallPrompt() {
  const { t } = useI18n(); const [ev, setEv] = useState<any>(null);
  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone);
  const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  useEffect(() => { const h = (e: Event) => { e.preventDefault(); setEv(e); }; window.addEventListener('beforeinstallprompt', h); return () => window.removeEventListener('beforeinstallprompt', h); }, []);
  if (standalone) return null;
  if (ev) return <button className="btn-secondary" onClick={() => { void ev.prompt(); setEv(null); }}><Download className="h-5 w-5" />{t('pwa.install')}</button>;
  return ios ? <p className="rounded-xl bg-champagne p-2 text-xs" role="note">{t('pwa.ios')}</p> : null;
}
