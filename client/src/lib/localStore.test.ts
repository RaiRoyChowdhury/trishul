import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { enqueue, getKv, listQueue, putKv, queueCount, removeQueue, updateQueue, wipeAll } from './localStore';
import { flushQueue } from './syncQueue';
import { decideNet } from './onlineStatus';

beforeEach(async () => { await wipeAll(); });
describe('encrypted local store', () => {
  it('round-trips cached data and stores it encrypted at rest', async () => {
    await putKv('get:/contacts', [{ name: 'Maa', phone: '+919800000001' }]);
    expect((await getKv<{ name: string }[]>('get:/contacts'))?.value[0].name).toBe('Maa');
    const raw = await (await import('idb')).openDB('trishul-offline', 1).then(d => d.get('kv', 'get:/contacts'));
    expect(JSON.stringify(Array.from(new Uint8Array(raw.s.data)))).not.toContain('Maa'); expect(new TextDecoder().decode(raw.s.data)).not.toContain('+9198');
  });
  it('queue keeps order and statuses', async () => {
    const a = await enqueue('report', { n: 1 }); await new Promise(r => setTimeout(r, 3)); await enqueue('sos', { n: 2 }); await enqueue('report', { n: 3 });
    expect((await listQueue('report')).map(x => (x.payload as any).n)).toEqual([1, 3]); expect(await queueCount()).toBe(3);
    await updateQueue(a, { status: 'failed', lastError: 'x' }); expect((await listQueue('report'))[0].status).toBe('failed'); await removeQueue(a); expect(await queueCount()).toBe(2);
  });
  it('delete offline data removes everything', async () => { await putKv('k', 1); await enqueue('sos', { a: 1 }); await wipeAll(); expect(await getKv('k')).toBeNull(); expect(await queueCount()).toBe(0); });
});
describe('sync when the connection returns', () => {
  it('sends oldest first and removes what was sent', async () => {
    await enqueue('report', { n: 1 }); await new Promise(r => setTimeout(r, 3)); await enqueue('report', { n: 2 }); const seen: number[] = [];
    const rep = await flushQueue('report', async it => { seen.push((it.payload as any).n); return { ok: true }; });
    expect(seen).toEqual([1, 2]); expect(rep.sent).toHaveLength(2); expect(await queueCount()).toBe(0);
  });
  it('a network failure stops the run and keeps items queued', async () => {
    await enqueue('report', { n: 1 }); await enqueue('report', { n: 2 }); let calls = 0;
    const rep = await flushQueue('report', async () => { calls++; return { ok: false, permanent: false, error: 'NETWORK' }; });
    expect(calls).toBe(1); expect(rep.stopped).toBe(true); const left = await listQueue('report'); expect(left).toHaveLength(2); expect(left[0].status).toBe('queued'); expect(left[0].attempts).toBe(1);
  });
  it('a permanent rejection marks the item failed and continues', async () => {
    await enqueue('report', { n: 1 }); await new Promise(r => setTimeout(r, 3)); await enqueue('report', { n: 2 });
    const rep = await flushQueue('report', async it => ((it.payload as any).n === 1 ? { ok: false, permanent: true, error: 'BAD' } : { ok: true }));
    expect(rep.failed).toHaveLength(1); expect(rep.sent).toHaveLength(1); expect((await listQueue('report'))[0].status).toBe('failed');
  });
  it('failed items are not retried forever', async () => { const id = await enqueue('sos', {}); await updateQueue(id, { status: 'failed' }); let c = 0; await flushQueue('sos', async () => { c++; return { ok: true }; }); expect(c).toBe(0); });
});
describe('online status', () => {
  it('needs the browser AND the server check', () => { expect(decideNet(false, 'ok')).toBe('offline'); expect(decideNet(true, 'fail')).toBe('offline'); expect(decideNet(true, 'ok')).toBe('online'); expect(decideNet(true, 'none')).toBe('checking'); });
});
