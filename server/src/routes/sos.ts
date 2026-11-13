import { Router } from 'express';
import { z } from 'zod';
import { ah, dbCheck, HttpError, limiter, parse, requireAuth, svc, type AuthedRequest } from '../lib.js';
import { sendAlert } from '../notify.js';

const r = Router();
r.use(requireAuth);
const A = (req: unknown) => req as AuthedRequest;

export function alertText(name: string, lang: string, at: Date, loc?: { lat: number; lng: number } | null, test = false) {
  const t = at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
  const link = loc ? `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=17/${loc.lat}/${loc.lng}` : '';
  const head = test ? 'TRISHUL TEST MESSAGE (not an emergency)' : 'TRISHUL SAFETY ALERT';
  if (lang === 'bn') return `${head}\n${name} নিরাপত্তা সতর্কতা চালু করেছেন (${t}).${loc ? `\nসম্ভাব্য অবস্থান: ${link}` : '\nঅবস্থান শেয়ার করা হয়নি।'}\nঅনুগ্রহ করে তাঁকে এখনই ফোন করুন। জরুরি হলে ১১২ নম্বরে ফোন করুন।`;
  if (lang === 'hi') return `${head}\n${name} ने सुरक्षा अलर्ट चालू किया है (${t}).${loc ? `\nअनुमानित स्थान: ${link}` : '\nस्थान साझा नहीं किया गया।'}\nकृपया उन्हें तुरंत कॉल करें। आपातकाल में 112 पर कॉल करें।`;
  return `${head}\n${name} triggered a safety alert (${t}).${loc ? `\nApproximate location: ${link}` : '\nLocation was not shared.'}\nPlease call them now. In an emergency call 112.\nTRISHUL has not contacted the police.`;
}

const body = z.object({
  client_event_id: z.string().uuid(),
  source: z.enum(['secret_code', 'no_touch_voice', 'no_touch_shake', 'manual']),
  mode: z.enum(['live', 'test']),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100000).optional() }).nullish(),
}).strict();

r.post('/sos', limiter(3600_000, 12, 'SOS_RATE_LIMITED'), ah(async (req, res) => {
  const { db, userId } = A(req);
  const b = parse(body, req.body);
  const settings = dbCheck(await db.from('user_settings').select('location_consent').eq('user_id', userId).maybeSingle()) as any;
  const profile = dbCheck(await db.from('profiles').select('display_name,language').eq('id', userId).maybeSingle()) as any;
  // Location is stored/sent ONLY if the user gave consent in Settings.
  const loc = settings?.location_consent && b.location ? b.location : null;
  const ins = await db.from('sos_events').insert({
    user_id: userId, client_event_id: b.client_event_id, source: b.source, mode: b.mode,
    location_consented: !!settings?.location_consent, lat: loc?.lat ?? null, lng: loc?.lng ?? null, accuracy_m: loc?.accuracy ?? null,
  }).select().single();
  if (ins.error?.code === '23505') { // retry of the same event: return what we already have, never alert twice
    const ev = dbCheck(await db.from('sos_events').select('*, notification_attempts(*)').eq('client_event_id', b.client_event_id).single());
    res.json({ event: ev, duplicate: true }); return;
  }
  const event = dbCheck(ins) as any;
  if (b.mode === 'test') { res.status(201).json({ event: { ...event, notification_attempts: [] }, note: 'TEST MODE: no notification was sent.' }); return; }

  const contacts = (dbCheck(await db.from('trusted_contacts').select('*')) as any[]) ?? [];
  const text = alertText(profile?.display_name ?? 'Your contact', profile?.language ?? 'en', new Date(event.triggered_at), loc);
  const attempts = await Promise.all(contacts.map(async (c) => {
    const s = await sendAlert(c, text);
    return { sos_event_id: event.id, contact_id: c.id, contact_name: c.name, channel: s.channel, status: s.status, provider_message_id: s.providerMessageId ?? null, error_message: s.error ?? null };
  }));
  if (attempts.length) dbCheck(await svc().from('notification_attempts').insert(attempts));
  if (!attempts.length) attempts.push({ sos_event_id: event.id, contact_id: null, contact_name: '-', channel: 'sms', status: 'unavailable', provider_message_id: null, error_message: 'You have no trusted contacts yet. Add one in Settings.' });
  res.status(201).json({ event: { ...event, notification_attempts: attempts }, note: 'TRISHUL has NOT contacted police or emergency services.' });
}));

r.post('/sos/:id/cancel', ah(async (req, res) => {
  const { db, userId } = A(req);
  const ev = dbCheck(await db.from('sos_events').select('*, notification_attempts(*)').eq('id', req.params.id).maybeSingle()) as any;
  if (!ev) throw new HttpError(404, 'NOT_FOUND', 'Event not found.');
  dbCheck(await db.from('sos_events').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', ev.id));
  // If contacts were already alerted, tell them it was a false alarm.
  const profile = dbCheck(await db.from('profiles').select('display_name').eq('id', userId).maybeSingle()) as any;
  const sent = (ev.notification_attempts ?? []).filter((a: any) => a.status === 'sent' && a.contact_id);
  let followUps = 0;
  if (ev.mode === 'live' && sent.length) {
    const cs = (dbCheck(await db.from('trusted_contacts').select('*').in('id', sent.map((a: any) => a.contact_id))) as any[]) ?? [];
    await Promise.all(cs.map(c => sendAlert(c, `TRISHUL: ${profile?.display_name ?? 'Your contact'} cancelled the earlier alert. It was a false alarm.`)));
    followUps = cs.length;
  }
  res.json({ ok: true, followUps });
}));

r.get('/sos', ah(async (req, res) => {
  const { db } = A(req);
  res.json(dbCheck(await db.from('sos_events').select('*, notification_attempts(*)').order('triggered_at', { ascending: false }).limit(20)));
}));

// Sends one clearly-labelled TEST message so the user can confirm the provider really works.
r.post('/contacts/:id/test', limiter(3600_000, 10), ah(async (req, res) => {
  const { db, userId } = A(req);
  const c = dbCheck(await db.from('trusted_contacts').select('*').eq('id', req.params.id).maybeSingle()) as any;
  if (!c) throw new HttpError(404, 'NOT_FOUND', 'Contact not found.');
  const profile = dbCheck(await db.from('profiles').select('display_name,language').eq('id', userId).maybeSingle()) as any;
  const s = await sendAlert(c, alertText(profile?.display_name ?? 'Your contact', profile?.language ?? 'en', new Date(), null, true));
  res.json(s);
}));

export default r;
