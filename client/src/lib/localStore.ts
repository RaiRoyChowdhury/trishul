// Offline storage on this device (IndexedDB). Sensitive values are encrypted with AES-GCM (WebCrypto).
// The key is generated on this device and stored as a NON-EXTRACTABLE CryptoKey: scripts cannot read its bytes.
// Honest limit: this protects against casual snooping at rest. It cannot protect a phone that is already compromised or unlocked.
import { openDB, type IDBPDatabase } from 'idb';

export type QueueKind = 'report' | 'sos';
export type QueueStatus = 'queued' | 'sending' | 'failed';
export interface QueueItem<T = unknown> { id: string; kind: QueueKind; createdAt: number; status: QueueStatus; attempts: number; lastError?: string; payload: T }
interface Sealed { iv: ArrayBuffer; data: ArrayBuffer }

const DB = 'trishul-offline'; const VERSION = 1;
let dbp: Promise<IDBPDatabase> | null = null; let memKey: CryptoKey | null = null;
const db = () => (dbp ??= openDB(DB, VERSION, { upgrade(d) { d.createObjectStore('kv'); d.createObjectStore('queue', { keyPath: 'id' }); d.createObjectStore('keys'); } }));

async function key(): Promise<CryptoKey> {
  if (memKey) return memKey; const d = await db();
  const have = await d.get('keys', 'main') as CryptoKey | undefined; if (have) return (memKey = have);
  const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  try { await d.put('keys', k, 'main'); } catch { /* some browsers cannot store keys: it then lives only for this session */ }
  return (memKey = k);
}
async function seal(v: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(JSON.stringify(v)));
  return { iv: iv.buffer as ArrayBuffer, data };
}
async function unseal<T>(s: Sealed): Promise<T> { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: s.iv }, await key(), s.data))) as T; }

/** Cached copy of something fetched from the server (settings, contacts, journeys, reports). */
export async function putKv(k: string, value: unknown): Promise<void> { await (await db()).put('kv', { s: await seal(value), at: Date.now() }, k); }
export async function getKv<T>(k: string): Promise<{ value: T; at: number } | null> {
  const r = await (await db()).get('kv', k) as { s: Sealed; at: number } | undefined; if (!r) return null;
  try { return { value: await unseal<T>(r.s), at: r.at }; } catch { return null; }   // unreadable (key lost): treated as empty
}

export async function enqueue<T>(kind: QueueKind, payload: T, id: string = crypto.randomUUID()): Promise<string> {
  await (await db()).put('queue', { id, kind, createdAt: Date.now(), status: 'queued' as QueueStatus, attempts: 0, p: await seal(payload) });
  return id;
}
export async function listQueue<T = unknown>(kind?: QueueKind): Promise<QueueItem<T>[]> {
  const rows = (await (await db()).getAll('queue')) as any[]; const out: QueueItem<T>[] = [];
  for (const r of rows) { if (kind && r.kind !== kind) continue; try { out.push({ id: r.id, kind: r.kind, createdAt: r.createdAt, status: r.status, attempts: r.attempts, lastError: r.lastError, payload: await unseal<T>(r.p) }); } catch { /* skip unreadable */ } }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}
export async function updateQueue(id: string, patch: Partial<Pick<QueueItem, 'status' | 'attempts' | 'lastError'>>): Promise<void> {
  const d = await db(); const r = await d.get('queue', id); if (r) await d.put('queue', { ...r, ...patch });
}
export async function removeQueue(id: string): Promise<void> { await (await db()).delete('queue', id); }
export async function queueCount(): Promise<number> { return (await db()).count('queue'); }

/** "Delete offline data": removes every cached copy, queued item AND the encryption key. */
export async function wipeAll(): Promise<void> {
  const d = await db(); await Promise.all([d.clear('kv'), d.clear('queue'), d.clear('keys')]); memKey = null;
}
