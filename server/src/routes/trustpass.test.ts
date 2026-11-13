import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { makeFakeDb } from '../fakeDb.js';

let fake = makeFakeDb();
vi.mock('../lib.js', async () => { const a = await vi.importActual<typeof import('../lib.js')>('../lib.js'); return { ...a, svc: () => fake.client as any }; });

const HOST = '11111111-1111-4111-8111-111111111111', GUEST = '22222222-2222-4222-8222-222222222222', OTHER = '33333333-3333-4333-8333-333333333333';
const J = '44444444-4444-4444-8444-444444444444', R = '55555555-5555-4555-8555-555555555555';
let server: import('node:http').Server; let base = '';
const call = async (as: string, method: string, path: string, body?: unknown) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-test-user': as }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) as any };
};
const prof = (id: string, name: string) => ({ id, display_name: name, age_group: 'adult', age: 30, profession: 'working', photo_status: 'none', verification_status: 'test_account', privacy_name: 'first', privacy_photo: true, privacy_age: true });
beforeAll(async () => {
  const { default: router } = await import('./trustpass.js');
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { Object.assign(req, { userId: req.headers['x-test-user'] }); next(); });
  app.use('/api', router);
  app.use((await import('../lib.js')).errorHandler);
  await new Promise<void>(r => { server = app.listen(0, r); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => { server.close(); });
beforeEach(() => {
  fake = makeFakeDb({ journeys: [{ id: J, owner_id: HOST, status: 'open', audience: 'adult' }], journey_requests: [{ id: R, journey_id: J, requester_id: GUEST, status: 'accepted' }], profiles: [prof(HOST, 'Arjun Sen'), prof(GUEST, 'Ananya Sen')], trustpass_challenges: [] });
});
const issue = async () => (await call(HOST, 'POST', '/trustpass/issue', { journey_id: J, request_id: R })).body as { id: string; payload: string };

describe('TrustPass routes (in-memory database)', () => {
  it('full happy path: issue, scan, both confirm, verified', async () => {
    const q = await issue(); expect(q.payload).toMatch(/^TP1\./);
    const s = await call(GUEST, 'POST', '/trustpass/scan', { payload: q.payload }); expect(s.status).toBe(200); expect(s.body.person.name).toBe('Arjun');
    expect((await call(HOST, 'POST', `/trustpass/${q.id}/confirm`)).body.state).toBe('waiting_other');
    expect((await call(GUEST, 'POST', `/trustpass/${q.id}/confirm`)).body.state).toBe('verified');
    expect(fake.tables.trustpass_challenges[0].status).toBe('verified');
  });
  it('the stored row holds only a hash, never the nonce', async () => {
    const q = await issue(); const nonce = q.payload.split('.')[2];
    expect(JSON.stringify(fake.tables.trustpass_challenges)).not.toContain(nonce);
  });
  it('a QR is single use: the second scan is refused', async () => {
    const q = await issue(); await call(GUEST, 'POST', '/trustpass/scan', { payload: q.payload });
    expect((await call(GUEST, 'POST', '/trustpass/scan', { payload: q.payload })).body.error.code).toBe('TRUSTPASS_USED');
  });
  it('a stranger cannot scan it', async () => {
    const q = await issue(); const r = await call(OTHER, 'POST', '/trustpass/scan', { payload: q.payload }); expect(r.status).toBe(403);
  });
  it('an expired QR is refused', async () => {
    const q = await issue(); fake.tables.trustpass_challenges[0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await call(GUEST, 'POST', '/trustpass/scan', { payload: q.payload })).body.error.code).toBe('TRUSTPASS_EXPIRED');
  });
  it('a forged nonce is refused', async () => {
    const q = await issue(); const bad = `${q.payload.slice(0, q.payload.lastIndexOf('.') + 1)}${'A'.repeat(43)}`;
    expect((await call(GUEST, 'POST', '/trustpass/scan', { payload: bad })).body.error.code).toBe('TRUSTPASS_INVALID');
  });
  it('only the host can issue, and only for an accepted request', async () => {
    expect((await call(GUEST, 'POST', '/trustpass/issue', { journey_id: J, request_id: R })).status).toBe(403);
    fake.tables.journey_requests[0].status = 'pending';
    expect((await call(HOST, 'POST', '/trustpass/issue', { journey_id: J, request_id: R })).body.error.code).toBe('NOT_ACCEPTED');
  });
  it('cannot confirm before scanning; teen walks get no TrustPass', async () => {
    const q = await issue(); expect((await call(HOST, 'POST', `/trustpass/${q.id}/confirm`)).body.error.code).toBe('TRUSTPASS_NOT_SCANNED');
    fake.tables.journeys[0].audience = 'teen';
    expect((await call(HOST, 'POST', '/trustpass/issue', { journey_id: J, request_id: R })).body.error.code).toBe('TEEN_NO_TRUSTPASS');
  });
  it('a new QR cancels the older unused one', async () => {
    const a = await issue(); await issue();
    expect(fake.tables.trustpass_challenges.find(c => c.id === a.id)?.status).toBe('cancelled');
  });
});
