// Android SMS fallback (native app only). The web/PWA CANNOT send SMS silently, so this only works inside the Capacitor Android shell.
// Rules: explicit consent first; Android SEND_SMS permission; the result is "handed to the phone", NEVER "delivered".
// SMS also needs mobile signal. With no signal the phone may queue or fail it; we cannot know, so we never promise.
export interface SmsPlugin { checkPermission(): Promise<{ granted: boolean }>; requestPermission(): Promise<{ granted: boolean }>; send(o: { to: string; body: string }): Promise<{ handedToPhone: boolean }> }
export type SmsStatus = 'handed_to_phone' | 'failed' | 'no_permission' | 'no_consent' | 'no_number' | 'unavailable';
export interface SmsResult { name: string; status: SmsStatus }
const CONSENT = 'trishul.smsConsent';

export const nativePlugin = (): SmsPlugin | null => ((globalThis as any).Capacitor?.Plugins?.SmsFallback as SmsPlugin | undefined) ?? null;
export const smsAvailable = () => !!nativePlugin();
export const hasSmsConsent = () => { try { return localStorage.getItem(CONSENT) === '1'; } catch { return false; } };
export const setSmsConsent = (v: boolean) => { try { v ? localStorage.setItem(CONSENT, '1') : localStorage.removeItem(CONSENT); } catch { /* ignore */ } };

export async function sendSmsFallback(contacts: { name: string; phone: string | null; consent_confirmed: boolean }[], body: string, plugin: SmsPlugin | null = nativePlugin(), consent = hasSmsConsent()): Promise<SmsResult[]> {
  if (!plugin) return contacts.map(c => ({ name: c.name, status: 'unavailable' as const }));
  if (!consent) return contacts.map(c => ({ name: c.name, status: 'no_consent' as const }));
  let granted = false; try { granted = (await plugin.checkPermission()).granted || (await plugin.requestPermission()).granted; } catch { granted = false; }
  if (!granted) return contacts.map(c => ({ name: c.name, status: 'no_permission' as const }));
  const out: SmsResult[] = [];
  for (const c of contacts) {
    if (!c.consent_confirmed || !c.phone) { out.push({ name: c.name, status: 'no_number' }); continue; }   // only contacts who agreed
    try { out.push({ name: c.name, status: (await plugin.send({ to: c.phone, body })).handedToPhone ? 'handed_to_phone' : 'failed' }); } catch { out.push({ name: c.name, status: 'failed' }); }
  }
  return out;
}

/** Any browser: a link that opens the phone's messaging app with the agreed contacts and the SOS text filled in.
 *  The person must press Send. A web page cannot send SMS by itself, and the link cannot say whether it was sent. */
export function smsComposeHref(contacts: { phone: string | null; consent_confirmed: boolean }[], body: string, ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): string | null {
  const nums = contacts.filter(c => c.consent_confirmed && c.phone).map(c => (c.phone as string).replace(/[^\d+]/g, '')).filter(n => n.length >= 6);
  if (!nums.length) return null;
  const to = nums.join(','), b = encodeURIComponent(body);
  return /iPhone|iPad|iPod/i.test(ua) ? `sms:/open?addresses=${to}&body=${b}` : `sms:${to}?body=${b}`;
}
