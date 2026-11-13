import { describe, expect, it, vi } from 'vitest';
import { sendSmsFallback, smsComposeHref, type SmsPlugin } from './nativeSms';
const contacts = [{ name: 'Maa', phone: '+919800000001', consent_confirmed: true }, { name: 'NoPhone', phone: null, consent_confirmed: true }, { name: 'NoConsent', phone: '+919800000002', consent_confirmed: false }];
const plugin = (granted = true, ok = true): SmsPlugin => ({ checkPermission: async () => ({ granted }), requestPermission: async () => ({ granted }), send: vi.fn(async () => ({ handedToPhone: ok })) });
describe('Android SMS fallback rules', () => {
  it('web/PWA has no plugin: nothing is sent and the status says unavailable', async () => { expect((await sendSmsFallback(contacts, 'x', null, true)).every(r => r.status === 'unavailable')).toBe(true); });
  it('no user consent: nothing is sent', async () => { const p = plugin(); const r = await sendSmsFallback(contacts, 'x', p, false); expect(r.every(x => x.status === 'no_consent')).toBe(true); expect(p.send).not.toHaveBeenCalled(); });
  it('permission refused: nothing is sent', async () => { const p = plugin(false); expect((await sendSmsFallback(contacts, 'x', p, true))[0].status).toBe('no_permission'); expect(p.send).not.toHaveBeenCalled(); });
  it('sends only to contacts who agreed and have a number; result is never "delivered"', async () => {
    const p = plugin(); const r = await sendSmsFallback(contacts, 'help', p, true);
    expect(r.map(x => x.status)).toEqual(['handed_to_phone', 'no_number', 'no_number']); expect(p.send).toHaveBeenCalledTimes(1); expect(JSON.stringify(r)).not.toMatch(/deliver/i);
  });
  it('a failing send is reported as failed', async () => { expect((await sendSmsFallback([contacts[0]], 'x', plugin(true, false), true))[0].status).toBe('failed'); });
  it('SMS link: only agreed contacts with a number, Android format', () => {
    const h = smsComposeHref(contacts, 'help me', 'Android')!;
    expect(h).toBe('sms:+919800000001?body=help%20me');
  });
  it('SMS link: iPhone format and several numbers', () => {
    const h = smsComposeHref([contacts[0], { name: 'B', phone: '+91 98000 00003', consent_confirmed: true }], 'x', 'iPhone')!;
    expect(h).toBe('sms:/open?addresses=+919800000001,+919800000003&body=x');
  });
  it('SMS link: nobody agreed or no number gives no link', () => { expect(smsComposeHref([contacts[1], contacts[2]], 'x', 'Android')).toBeNull(); });
});
