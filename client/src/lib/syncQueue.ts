// Sends queued items when the connection is back. Pure logic around an injected sender, so it is unit-tested without a network.
import { listQueue, removeQueue, updateQueue, type QueueItem, type QueueKind } from './localStore';

export type SendResult = { ok: true; result?: unknown } | { ok: false; permanent: boolean; error: string };
export interface FlushReport { sent: { item: QueueItem; result?: unknown }[]; failed: QueueItem[]; stopped: boolean }

/** Oldest first. A network failure stops the run (try again later). A permanent rejection (e.g. invalid data) marks the item failed. */
export async function flushQueue(kind: QueueKind, send: (item: QueueItem) => Promise<SendResult>): Promise<FlushReport> {
  const rep: FlushReport = { sent: [], failed: [], stopped: false };
  for (const item of await listQueue(kind)) {
    if (item.status === 'failed') continue;
    await updateQueue(item.id, { status: 'sending', attempts: item.attempts + 1 });
    const r = await send(item);
    if (r.ok) { await removeQueue(item.id); rep.sent.push({ item, result: r.result }); continue; }
    if (r.permanent) { await updateQueue(item.id, { status: 'failed', lastError: r.error }); rep.failed.push({ ...item, status: 'failed', lastError: r.error }); continue; }
    await updateQueue(item.id, { status: 'queued', lastError: r.error }); rep.stopped = true; break;
  }
  return rep;
}
