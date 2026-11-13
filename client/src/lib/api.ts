import { supabase } from './supabase';
import { getKv, putKv } from './localStore';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/$/, '') + '/api';

async function raw(method: string, path: string, body?: unknown, rawBody?: Blob): Promise<Response> {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { ...(rawBody ? { 'content-type': rawBody.type || 'application/octet-stream' } : body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch { throw new ApiError(0, 'NETWORK', 'No connection to the server.'); }
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    const code = j?.error?.code ?? 'HTTP';
    if (code === 'AUTH_EXPIRED' && supabase) void supabase.auth.signOut();   // expired login -> back to the sign-in page
    throw new ApiError(res.status, code, j?.error?.message ?? res.statusText);
  }
  return res;
}
const json = async <T>(p: Promise<Response>) => (await p).json() as Promise<T>;

// Read-through cache (encrypted, per signed-in user): the last good answer is kept so key screens still open without internet.
// Never used for SOS, AI, TrustPass, locations or any write.
const CACHEABLE = /^\/(me|contacts|callers|journeys\/mine|reports|zones|havens|shakti\/volunteers|evidence)(\?|$)/;
const who = async () => (supabase ? (await supabase.auth.getSession()).data.session?.user.id : undefined) ?? 'anon';
export interface Meta<T> { data: T; cachedAt: number | null }
async function getMeta<T>(p: string): Promise<Meta<T>> {
  try { const data = await json<T>(raw('GET', p)); if (CACHEABLE.test(p)) void who().then(u => putKv(`${u}:${p}`, data)).catch(() => undefined); return { data, cachedAt: null }; }
  catch (e) {
    if (e instanceof ApiError && e.code === 'NETWORK' && CACHEABLE.test(p)) { const c = await getKv<T>(`${await who()}:${p}`).catch(() => null); if (c) return { data: c.value, cachedAt: c.at }; }
    throw e;
  }
}
export const api = {
  get: async <T>(p: string) => (await getMeta<T>(p)).data,
  getMeta,
  post: <T>(p: string, b?: unknown) => json<T>(raw('POST', p, b ?? {})),
  put: <T>(p: string, b: unknown) => json<T>(raw('PUT', p, b)),
  patch: <T>(p: string, b: unknown) => json<T>(raw('PATCH', p, b)),
  del: <T>(p: string) => json<T>(raw('DELETE', p)),
  getBlob: async (p: string) => (await raw('GET', p)).blob(),
  upload: <T>(p: string, b: Blob) => json<T>(raw('POST', p, undefined, b)),
  blob: async (p: string, b: unknown) => (await raw('POST', p, b)).blob(),
};
