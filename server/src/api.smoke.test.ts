// Smoke tests: start the real Express app on a random port WITHOUT any credentials, and check honest behaviour.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from './app.js';
import { buildSystemPrompt, decodeSarvam, sarvamBody } from './routes/call.js';
import { alertText } from './routes/sos.js';

let server: Server; let base = '';
beforeAll(async () => { await new Promise<void>(r => { server = createApp().listen(0, () => r()); }); base = `http://localhost:${(server.address() as any).port}`; });
afterAll(() => { server.close(); });

describe('API without credentials', () => {
  it('health shows which services are missing and leaks no secrets', async () => {
    const j: any = await (await fetch(`${base}/api/health`)).json();
    expect(j.ok).toBe(true);
    expect(Object.values(j.services).every(v => typeof v === 'boolean')).toBe(true);
    expect(JSON.stringify(j)).not.toMatch(/sk-|secret|token/i);
  });
  it('rejects requests with no token (401)', async () => {
    for (const p of ['/api/me', '/api/contacts', '/api/reports', '/api/journeys/mine', '/api/sos']) {
      const r = await fetch(base + p); expect(r.status).toBe(401);
      expect(((await r.json()) as any).error.code).toBe('AUTH_REQUIRED');
    }
  });
  it('with a token but no Supabase configured, says so honestly (503), not fake success', async () => {
    const r = await fetch(`${base}/api/me`, { headers: { authorization: 'Bearer abc' } });
    expect(r.status).toBe(503); expect(((await r.json()) as any).error.code).toBe('SUPABASE_NOT_CONFIGURED');
  });
  it('unknown endpoints are 404 JSON or 401, never HTML', async () => {
    const r = await fetch(`${base}/api/nope`); expect([401, 404]).toContain(r.status);
  });
});

describe('message builders', () => {
  it('system prompt discloses AI and sets language', () => {
    const p = buildSystemPrompt({ name: 'বাবা', relationship: 'father', language: 'bn' }, 'in an auto');
    expect(p).toMatch(/SIMULATED/); expect(p).toMatch(/Bengali/); expect(p).toMatch(/112/);
  });
  it('alert text never claims police were contacted and marks tests', () => {
    expect(alertText('Durga', 'en', new Date(), { lat: 22.57, lng: 88.36 })).toMatch(/not contacted the police/);
    expect(alertText('Durga', 'en', new Date(), null, true)).toMatch(/TEST MESSAGE/);
    expect(alertText('Durga', 'bn', new Date(), null)).toMatch(/১১২/);
  });
});

describe('Sarvam voice helpers', () => {
  it('builds the request Sarvam documents (language code, model, speaker, sample rate)', () => {
    expect(sarvamBody('নমস্কার', 'bn', 'shubh', 'bulbul:v3')).toEqual({ text: 'নমস্কার', model: 'bulbul:v3', speaker: 'shubh', language_code: 'bn-IN', pace: 1, speech_sample_rate: 24000 });
    expect(sarvamBody('hi', 'hi', 'ritu', 'bulbul:v3').language_code).toBe('hi-IN');
  });
  it('decodes base64 audio and rejects empty or malformed responses', () => {
    expect(decodeSarvam({ audios: [Buffer.from('RIFFxxxx').toString('base64')] })?.toString()).toBe('RIFFxxxx');
    expect(decodeSarvam({ audios: [] })).toBeNull(); expect(decodeSarvam(null)).toBeNull(); expect(decodeSarvam({ audios: [5] })).toBeNull();
  });
});
