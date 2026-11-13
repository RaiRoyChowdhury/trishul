import express, { Router } from 'express';
import { z } from 'zod';
import { env } from '../config.js';
import { ah, dbCheck, HttpError, limiter, parse, requireAuth, type AuthedRequest } from '../lib.js';
import { actualLlm, actualStt, actualTts, computeStatus, estimateLlm, estimateStt, estimateTts, loadConfig, supabaseStore, withBudget } from '../aiBudget.js';
import { cloneQuery, isClonedId, looksLikeWav } from '../clone.js';

// Sarvam ONLY: Token Factory chat (replies), Speech-to-Text (microphone) and Bulbul Text-to-Speech (voice). No OpenAI, no other paid AI.
// Every paid call goes through withBudget(): reserve -> provider call -> settle. When live AI is off, nothing here calls a provider.
const r = Router();
r.use(requireAuth);
const A = (req: unknown) => req as AuthedRequest;
const LANG_NAME = { bn: 'Bengali (Bangla)', hi: 'Hindi', en: 'English' } as const;
const SARVAM_LANG = { bn: 'bn-IN', hi: 'hi-IN', en: 'en-IN' } as const;
const KEY = () => ({ 'api-subscription-key': env.sarvamKey });

export function buildSystemPrompt(c: { name: string; relationship: string; language: 'bn' | 'hi' | 'en'; speaking_style?: string | null }, scenario: string) {
  return [
    `You are role-playing ${c.name}, the user's ${c.relationship}, on a SIMULATED phone call inside a personal-safety app. The user knows this is an AI-generated simulated call.`,
    `Speak ${LANG_NAME[c.language]}; natural code-switching with common English words is fine (Kolkata style). Never use Latin transliteration for Bengali or Hindi: use the native script.`,
    `Sound like a caring, calm, slightly attentive ${c.relationship} on a real call: ask where the user is, how far from home or the destination, say you are waiting or on the way. Keep each reply to 1-2 short spoken sentences. No lists, no emojis, no stage directions.`,
    c.speaking_style ? `Speaking style hint from the user: ${c.speaking_style}` : '',
    `Situation the user chose: ${scenario}`,
    `Never ask for money, passwords, OTPs or personal data. If the user says they are in danger or need help, calmly tell them to use the SOS button or call 112 and keep them talking.`,
    `Never claim to be a real person if the user sincerely asks whether you are an AI; say you are an AI-simulated call in TRISHUL.`,
  ].filter(Boolean).join('\n');
}


export function sarvamBody(text: string, lang: 'bn' | 'hi' | 'en', speaker: string, model: string) {
  return { text, model, speaker, language_code: SARVAM_LANG[lang], pace: 1, speech_sample_rate: 24000 };
}
/** Sarvam returns { audios: [base64 WAV] }. */
export function decodeSarvam(j: any): Buffer | null {
  const parts = Array.isArray(j?.audios) ? j.audios.filter((x: unknown) => typeof x === 'string') : [];
  return parts.length ? Buffer.from(parts.join(''), 'base64') : null;
}
/** Some reasoning models wrap thoughts in <think>...</think>. Never speak them. */
export const cleanReply = (s: string) => s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
/** Seconds of audio in a PCM WAV (read from its header). */
export function wavSeconds(b: Buffer): number { if (b.length < 44) return 0; const rate = b.readUInt32LE(24), bytes = b.readUInt16LE(34) / 8, ch = b.readUInt16LE(22); return rate && bytes && ch ? (b.length - 44) / (rate * bytes * ch) : 0; }
// Speaker names from Sarvam's public docs (Shubh is the default). Check their docs for the full, current list.
const SARVAM_SPEAKERS = ['shubh', 'ritu', 'neha', 'ishita', 'aditya'];

async function liveOrThrow() {
  const st = computeStatus(await loadConfig(), Date.now(), !!env.sarvamKey);
  if (st.mode !== 'live') throw new HttpError(503, st.reason === 'no_key' ? 'VOICE_NOT_CONFIGURED' : 'AI_DEMO_MODE', st.reason === 'no_key' ? 'Sarvam is not configured. Add SARVAM_API_KEY to your .env file.' : `Live AI is off (${st.reason}). Scripted Demo Mode is used.`);
}

// Plain status for the app: live AI or Scripted Demo Mode, and why. No money figures for ordinary users.
r.get('/ai/status', ah(async (_req, res) => {
  const st = computeStatus(await loadConfig(), Date.now(), !!env.sarvamKey);
  res.json({ mode: st.mode, reason: st.reason, expires_at: st.expires_at });
}));

r.post('/call/reply', limiter(60_000, 20), ah(async (req, res) => {
  await liveOrThrow();
  const { db, userId } = A(req);
  const b = parse(z.object({
    callerId: z.string().uuid(), scenario: z.string().trim().max(200).default('The user is travelling alone.'),
    messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(500) })).min(1).max(30),
  }).strict(), req.body);
  const caller = dbCheck(await db.from('caller_profiles').select('*').eq('id', b.callerId).maybeSingle());
  if (!caller) throw new HttpError(404, 'CALLER_NOT_FOUND', 'Caller profile not found.');
  const messages = [{ role: 'system', content: buildSystemPrompt(caller, b.scenario) }, ...b.messages.slice(-12)];
  const MAX_OUT = 400, inChars = messages.reduce((s, m) => s + m.content.length, 0);
  const est = estimateLlm(inChars, MAX_OUT);
  const text = await withBudget(supabaseStore, { userId, provider: 'sarvam', model: env.sarvamChatModel, operation: 'chat' }, est, async () => {
    const rsp = await fetch('https://api.sarvam.ai/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', ...KEY(), authorization: `Bearer ${env.sarvamKey}` },
      body: JSON.stringify({ model: env.sarvamChatModel, temperature: 0.7, max_tokens: MAX_OUT, messages }), signal: AbortSignal.timeout(25000),
    }).catch(() => null);
    if (!rsp) throw new HttpError(502, 'AI_UNREACHABLE', 'Could not reach the AI service. Check your internet connection.');
    if (!rsp.ok) throw new HttpError(502, 'AI_FAILED', rsp.status === 401 || rsp.status === 403 ? 'The Sarvam API key was rejected.' : `The AI service returned an error (${rsp.status}).`);
    const j: any = await rsp.json().catch(() => null);
    const out = cleanReply(String(j?.choices?.[0]?.message?.content ?? ''));
    if (!out) throw new HttpError(502, 'AI_EMPTY', 'The AI service returned an empty reply.');
    return { result: out, actual: actualLlm(j?.usage, est), units: j?.usage };
  });
  res.json({ text });
}));

// Speech-to-Text: the browser sends a short mono WAV (max 30 s). The audio is forwarded to Sarvam and never stored.
r.post('/call/stt', limiter(60_000, 20), express.raw({ type: () => true, limit: '3mb' }), ah(async (req, res) => {
  await liveOrThrow(); const { userId } = A(req);
  if (!looksLikeWav(req.body)) throw new HttpError(400, 'BAD_AUDIO', 'Send a WAV recording of up to 30 seconds.');
  const secs = wavSeconds(req.body); if (!(secs > 0.3 && secs <= 30)) throw new HttpError(400, 'BAD_AUDIO', 'The recording must be between 0.3 and 30 seconds.');
  const text = await withBudget(supabaseStore, { userId, provider: 'sarvam', model: env.sarvamSttModel, operation: 'stt' }, estimateStt(secs), async () => {
    const form = new FormData(); form.set('file', new Blob([new Uint8Array(req.body)], { type: 'audio/wav' }), 'speech.wav'); form.set('model', env.sarvamSttModel); form.set('mode', 'codemix');
    const rsp = await fetch('https://api.sarvam.ai/speech-to-text', { method: 'POST', headers: KEY(), body: form, signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (!rsp) throw new HttpError(502, 'STT_UNREACHABLE', 'Could not reach the speech service.');
    if (!rsp.ok) throw new HttpError(502, 'STT_FAILED', rsp.status === 401 || rsp.status === 403 ? 'The Sarvam API key was rejected.' : `The speech service returned an error (${rsp.status}).`);
    const j: any = await rsp.json().catch(() => null);
    return { result: String(j?.transcript ?? '').trim(), actual: actualStt(secs), units: { seconds: secs, language: j?.language_code ?? null } };
  });
  res.json({ text });
}));

r.get('/voices', ah(async (_req, res) => {
  if (!env.sarvamKey) throw new HttpError(503, 'VOICE_NOT_CONFIGURED', 'Sarvam is not configured. Add SARVAM_API_KEY to your .env file.');
  res.json(SARVAM_SPEAKERS.map(s => ({ voice_id: s, name: s[0].toUpperCase() + s.slice(1), category: 'sarvam' })));
}));

r.post('/call/tts', limiter(60_000, 30), ah(async (req, res) => {
  await liveOrThrow();
  const { db, userId } = A(req);
  const b = parse(z.object({ text: z.string().trim().min(1).max(600), callerId: z.string().uuid() }).strict(), req.body);
  const caller = dbCheck(await db.from('caller_profiles').select('voice_id,voice_source,voice_consent_confirmed,language').eq('id', b.callerId).maybeSingle());
  if (!caller) throw new HttpError(404, 'CALLER_NOT_FOUND', 'Caller profile not found.');
  // A personalised voice is only used when the voice owner's consent was confirmed; otherwise a standard voice.
  const chosen = (caller.voice_id && (caller.voice_source === 'standard' || caller.voice_consent_confirmed)) ? caller.voice_id : '';
  const cloned = isClonedId(chosen); const lang = caller.language as 'bn' | 'hi' | 'en';
  const audio = await withBudget(supabaseStore, { userId, provider: 'sarvam', model: cloned ? 'voice-clone' : env.sarvamModel, operation: cloned ? 'tts-cloned' : 'tts' }, estimateTts(b.text.length, cloned), async () => {
    let rsp: Response | null;
    if (cloned) {
      const form = new FormData(); form.set('text', b.text); form.set('voice_id', chosen); form.set('language_code', SARVAM_LANG[lang]); form.set('output_audio_codec', 'wav'); form.set('speech_sample_rate', '24000');
      rsp = await fetch('https://api.sarvam.ai/voices/clone', { method: 'POST', headers: KEY(), body: form, signal: AbortSignal.timeout(40000) }).catch(() => null);
    } else {
      rsp = await fetch('https://api.sarvam.ai/text-to-speech', { method: 'POST', headers: { ...KEY(), 'content-type': 'application/json' }, body: JSON.stringify(sarvamBody(b.text, lang, (chosen || env.sarvamSpeaker).toLowerCase(), env.sarvamModel)), signal: AbortSignal.timeout(25000) }).catch(() => null);
    }
    if (!rsp) throw new HttpError(502, 'TTS_UNAVAILABLE', 'Could not reach the voice service.');
    if (!rsp.ok) { const d = await rsp.text().then(x => x.slice(0, 160)).catch(() => ''); throw new HttpError(502, 'TTS_FAILED', rsp.status === 401 || rsp.status === 403 ? 'The Sarvam API key was rejected, or this voice is not available on your account.' : `The voice service returned an error (${rsp.status}). ${d}`); }
    const j: any = await rsp.json().catch(() => null);
    const buf = cloned ? (typeof j?.audio_b64 === 'string' ? Buffer.from(j.audio_b64, 'base64') : typeof j?.audio === 'string' ? Buffer.from(j.audio, 'base64') : null) : decodeSarvam(j);
    if (!buf) throw new HttpError(502, 'TTS_FAILED', 'The voice service returned no audio.');
    return { result: buf, actual: actualTts(b.text.length, cloned), units: { chars: b.text.length, cloned } };
  });
  res.setHeader('content-type', 'audio/wav'); res.send(audio);
}));

// Create a cloned voice from a short WAV sample. Sarvam does not publish a price for CREATING a voice, so a fixed amount
// (SARVAM_CLONE_CREATE_PAISE, default 100 = Rs 1) is reserved and recorded as an assumption. Set it to 0 to disable cloning.
r.post('/voices/clone-sample', limiter(3_600_000, 10), express.raw({ type: () => true, limit: '6mb' }), ah(async (req, res) => {
  if (!env.sarvamKey) throw new HttpError(503, 'CLONE_UNSUPPORTED', 'Voice cloning needs SARVAM_API_KEY in your .env file.');
  if (env.cloneCreatePaise <= 0) throw new HttpError(503, 'CLONE_UNSUPPORTED', 'Voice cloning is switched off (SARVAM_CLONE_CREATE_PAISE=0).');
  await liveOrThrow(); const { userId } = A(req);
  const q = parse(cloneQuery, req.query);
  if (!looksLikeWav(req.body)) throw new HttpError(400, 'BAD_AUDIO', 'Send a WAV voice sample between a few seconds and 15 seconds long.');
  const out = await withBudget(supabaseStore, { userId, provider: 'sarvam', model: 'voice-clone', operation: 'clone-create' }, env.cloneCreatePaise, async () => {
    const form = new FormData(); form.set('file', new Blob([new Uint8Array(req.body)], { type: 'audio/wav' }), 'sample.wav'); form.set('name', q.name); form.set('language', SARVAM_LANG[q.language]);
    const rsp = await fetch('https://api.sarvam.ai/voices/create', { method: 'POST', headers: KEY(), body: form, signal: AbortSignal.timeout(60000) }).catch(() => null);
    if (!rsp) throw new HttpError(502, 'CLONE_UNAVAILABLE', 'Could not reach the voice service.');
    if (rsp.status === 422) throw new HttpError(422, 'CLONE_REJECTED', 'The sample was not clear enough. Use 10 to 15 seconds, one speaker, little noise.');
    if (rsp.status === 403) throw new HttpError(403, 'CLONE_LIMIT', 'Your Sarvam account has reached its cloned-voice limit.');
    if (rsp.status === 401) throw new HttpError(502, 'CLONE_FAILED', 'The Sarvam API key was rejected.');
    if (!rsp.ok) throw new HttpError(502, 'CLONE_FAILED', `The voice service could not create the voice (${rsp.status}). Try again.`);
    const j: any = await rsp.json().catch(() => null); const id = j?.data?.voice_id;
    if (!isClonedId(id)) throw new HttpError(502, 'CLONE_FAILED', 'The voice service returned no voice id.');
    return { result: { voice_id: id as string, reference_text: (j?.data?.reference_text ?? null) as string | null }, actual: env.cloneCreatePaise, units: { assumed_price: true } };
  });
  res.status(201).json(out);
}));

export default r;
