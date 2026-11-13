import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { makeFakeDb } from '../fakeDb.js';

let fake = makeFakeDb();
vi.mock('../lib.js', async () => { const a = await vi.importActual<typeof import('../lib.js')>('../lib.js'); return { ...a, svc: () => fake.client as any }; });
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
let server: import('node:http').Server; let base = '';
const call = async (as: string, method: string, path: string, body?: unknown) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-test-user': as }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) as any };
};
beforeAll(async () => {
  const lib = await import('../lib.js'); const ev = (await import('./evidence.js')).default; const ad = (await import('./admin.js')).default;
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { Object.assign(req, { userId: req.headers['x-test-user'], db: fake.client }); next(); });
  app.use('/api', ev, ad); app.use(lib.errorHandler);
  await new Promise<void>(r => { server = app.listen(0, r); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => { server.close(); });
beforeEach(() => { fake = makeFakeDb({ profiles: [{ id: A, role: 'user' }, { id: B, role: 'user' }, { id: 'ad', role: 'admin' }], evidence_records: [], evidence_audit: [], shakti_volunteers: [{ id: 'real1', display_name: 'Real Person', is_demo: false, area: 'X' }, { id: 'old', display_name: 'Old Demo', is_demo: true, area: 'Y' }], admin_audit: [] }); });

describe('Evidence Vault', () => {
  it('saves, lists and deletes only my own records, and logs every access', async () => {
    const c = await call(A, 'POST', '/evidence', { title: 'Followed near bus stop' }); expect(c.status).toBe(201);
    expect((await call(A, 'GET', '/evidence')).body).toHaveLength(1);
    expect((await call(B, 'GET', '/evidence')).body).toHaveLength(0);          // another user sees nothing
    expect((await call(B, 'DELETE', `/evidence/${c.body.id}`)).status).toBe(404);   // and cannot delete it
    expect((await call(A, 'DELETE', `/evidence/${c.body.id}`)).status).toBe(200);
    expect(fake.tables.evidence_audit.map(a => a.action)).toEqual(expect.arrayContaining(['create', 'list', 'delete']));
  });
  it('rejects an empty title and unknown fields', async () => {
    expect((await call(A, 'POST', '/evidence', { title: '  ' })).status).toBe(400);
    expect((await call(A, 'POST', '/evidence', { title: 'x', user_id: B })).status).toBe(400);
  });
});
describe('Admin guard', () => {
  it('a normal user is refused every admin action', async () => {
    for (const [m, p] of [['GET', '/admin/overview'], ['POST', '/admin/ai/activate'], ['POST', '/admin/demo/reset'], ['PUT', '/admin/ai/budget']] as const) expect((await call(A, m, p, m === 'PUT' ? { budget_inr: 999 } : undefined)).body.error.code).toBe('NOT_ADMIN');
  });
  it('demo reset touches only fictional volunteers and is audited', async () => {
    const r = await call('ad', 'POST', '/admin/demo/reset'); expect(r.status).toBe(200);
    const names = fake.tables.shakti_volunteers.map(v => v.display_name);
    expect(names).toContain('Real Person'); expect(names).not.toContain('Old Demo'); expect(names).toContain('Ananya Sen');
    expect(fake.tables.shakti_volunteers.filter(v => v.is_demo)).toHaveLength(6);
    expect(fake.tables.admin_audit.some(a => a.action === 'demo.reset')).toBe(true);
  });
});
