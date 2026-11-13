import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import type { ZodTypeAny, z } from 'zod';
import { env } from './config.js';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** Wraps async route handlers so a thrown error reaches our error handler instead of crashing. */
export const ah = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'VALIDATION_FAILED', r.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  return r.data;
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
let _svc: SupabaseClient | null = null;

/** Service client: bypasses RLS. Used ONLY for cross-user logic that our code checks itself. */
export function svc(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseServiceKey) throw new HttpError(503, 'SUPABASE_NOT_CONFIGURED', 'Supabase is not configured on the server. See docs/SETUP-WINDOWS.md.');
  return (_svc ??= createClient(env.supabaseUrl, env.supabaseServiceKey, opts));
}
/** User client: carries the user's own token so Row Level Security applies to every query. */
export function userDb(token: string): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseAnonKey) throw new HttpError(503, 'SUPABASE_NOT_CONFIGURED', 'Supabase is not configured on the server. See docs/SETUP-WINDOWS.md.');
  return createClient(env.supabaseUrl, env.supabaseAnonKey, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } });
}

export interface AuthedRequest extends Request { userId: string; token: string; db: SupabaseClient }

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    if ((req as Partial<AuthedRequest>).userId) { next(); return; }   // already authenticated by an earlier router
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) throw new HttpError(401, 'AUTH_REQUIRED', 'Please sign in.');
    const { data, error } = await svc().auth.getUser(token);
    if (error || !data.user) throw new HttpError(401, 'AUTH_EXPIRED', 'Your session has expired. Please sign in again.');
    Object.assign(req, { userId: data.user.id, token, db: userDb(token) });
    next();
  } catch (e) { next(e); }
};

/** Rate limit per signed-in user (falls back to IP). Protects SOS, reports and paid AI calls. */
export const limiter = (windowMs: number, max: number, code = 'RATE_LIMITED') => rateLimit({
  windowMs, limit: max, standardHeaders: true, legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => (req as Partial<AuthedRequest>).userId ?? req.ip ?? 'anon',
  handler: (_req, res) => { res.status(429).json({ error: { code, message: 'Too many requests. Please wait a little and try again.' } }); },
});

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) { res.status(err.status).json({ error: { code: err.code, message: err.message } }); return; }
  // Secure logging: log the error type and message only, never request bodies, tokens or phrases.
  console.error('[server error]', err instanceof Error ? err.message : 'unknown');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.' } });
}

/** Turn a Supabase error into an HttpError (never leaks SQL details). */
export function dbCheck<T>(r: { data: T; error: { message: string; code?: string } | null }): T {
  if (r.error) {
    if (r.error.code === '23505') throw new HttpError(409, 'ALREADY_EXISTS', 'That already exists.');
    if (r.error.code === '23514') throw new HttpError(400, 'CONSTRAINT_FAILED', 'One of the values is not allowed.');
    console.error('[db error]', r.error.code, r.error.message);
    throw new HttpError(500, 'DB_ERROR', 'Database error.');
  }
  return r.data;
}
