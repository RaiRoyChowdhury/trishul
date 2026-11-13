// Real notification providers. We NEVER claim "delivered": 'sent' only means the provider accepted the message.
import { env } from './config.js';

export interface SendResult { channel: 'telegram' | 'sms'; status: 'sent' | 'failed' | 'unavailable'; providerMessageId?: string; error?: string }
export interface ContactLike { telegram_chat_id?: string | null; phone?: string | null; consent_confirmed?: boolean }

async function telegram(chatId: string, text: string): Promise<SendResult> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.telegramToken}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10000),
    });
    const j: any = await r.json().catch(() => ({}));
    if (r.ok && j.ok) return { channel: 'telegram', status: 'sent', providerMessageId: String(j.result?.message_id ?? '') };
    return { channel: 'telegram', status: 'failed', error: String(j.description ?? `HTTP ${r.status}`).slice(0, 200) };
  } catch (e) { return { channel: 'telegram', status: 'failed', error: e instanceof Error ? e.message.slice(0, 200) : 'network error' }; }
}

async function twilioSms(to: string, text: string): Promise<SendResult> {
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilioSid}/Messages.json`, {
      method: 'POST',
      headers: { authorization: 'Basic ' + Buffer.from(`${env.twilioSid}:${env.twilioToken}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: env.twilioFrom, Body: text }),
      signal: AbortSignal.timeout(10000),
    });
    const j: any = await r.json().catch(() => ({}));
    if (r.status === 201 && j.sid) return { channel: 'sms', status: 'sent', providerMessageId: j.sid };
    return { channel: 'sms', status: 'failed', error: String(j.message ?? `HTTP ${r.status}`).slice(0, 200) };
  } catch (e) { return { channel: 'sms', status: 'failed', error: e instanceof Error ? e.message.slice(0, 200) : 'network error' }; }
}

export async function sendAlert(c: ContactLike, text: string): Promise<SendResult> {
  if (!c.consent_confirmed) return { channel: c.telegram_chat_id ? 'telegram' : 'sms', status: 'unavailable', error: 'This contact has not confirmed that they agree to receive alerts.' };
  if (c.telegram_chat_id && env.telegramToken) return telegram(c.telegram_chat_id, text);
  if (c.phone && env.twilioSid && env.twilioToken && env.twilioFrom) return twilioSms(c.phone, text);
  const why = c.telegram_chat_id ? 'Telegram is not configured on the server.' : c.phone ? 'SMS (Twilio) is not configured on the server.' : 'No usable channel for this contact.';
  return { channel: c.telegram_chat_id ? 'telegram' : 'sms', status: 'unavailable', error: why };
}
