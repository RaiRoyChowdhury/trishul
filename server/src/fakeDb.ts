// Tiny in-memory stand-in for the Supabase client, ONLY for route tests. Supports the few query shapes our routes use.
type Row = Record<string, any>;
/** Column defaults the real database would apply on insert. */
const DEFAULTS: Record<string, Row> = { trustpass_challenges: { status: 'issued', issuer_confirmed: false, scanner_confirmed: false, scanned_at: null, verified_at: null }, evidence_records: { retention_days: 90 } };
export function makeFakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map(r => ({ ...r }))]));
  let n = 0;
  const q = (table: string) => {
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select'; let patch: Row | Row[] = {};
    const filters: ((r: Row) => boolean)[] = []; let single = false, maybe = false, wantRows = false, lim = Infinity, orderBy: [string, boolean] | null = null;
    const rows = () => (tables[table] ??= []);
    const exec = () => {
      let out: Row[];
      if (mode === 'insert') { const add = (Array.isArray(patch) ? patch : [patch]).map(r => ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, created_at: new Date().toISOString(), ...(DEFAULTS[table] ?? {}), ...r })); rows().push(...add); out = add; }
      else if (mode === 'update') { out = rows().filter(r => filters.every(f => f(r))); out.forEach(r => Object.assign(r, patch)); }
      else if (mode === 'delete') { out = rows().filter(r => filters.every(f => f(r))); tables[table] = rows().filter(r => !out.includes(r)); }
      else out = rows().filter(r => filters.every(f => f(r)));
      if (orderBy) out = [...out].sort((a, b) => (a[orderBy![0]] > b[orderBy![0]] ? 1 : -1) * (orderBy![1] ? 1 : -1));
      out = out.slice(0, lim).map(r => ({ ...r }));
      if (single) return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: 'not single' } };
      if (maybe) return { data: out[0] ?? null, error: null };
      return { data: out, error: null };
    };
    const b: any = {
      select: () => { wantRows = true; return b; }, insert: (r: Row | Row[]) => { mode = 'insert'; patch = r; return b; }, update: (r: Row) => { mode = 'update'; patch = r; return b; }, upsert: (r: Row) => { mode = 'insert'; patch = r; return b; }, delete: () => { mode = 'delete'; return b; },
      eq: (c: string, v: any) => { filters.push(r => r[c] === v); return b; }, neq: (c: string, v: any) => { filters.push(r => r[c] !== v); return b; }, in: (c: string, v: any[]) => { filters.push(r => v.includes(r[c])); return b; },
      is: (c: string, v: any) => { filters.push(r => (r[c] ?? null) === v); return b; }, gte: (c: string, v: any) => { filters.push(r => r[c] >= v); return b; },
      or: (s: string) => { const parts = s.split(',').map(p => p.split('.')); filters.push(r => parts.some(([c, , v]) => r[c] === v)); return b; },
      order: (c: string, o?: { ascending?: boolean }) => { orderBy = [c, o?.ascending !== false]; return b; }, limit: (x: number) => { lim = x; return b; },
      single: () => { single = true; return b; }, maybeSingle: () => { maybe = true; return b; },
      then: (res: (v: any) => any, rej?: (e: any) => any) => { void wantRows; try { return Promise.resolve(exec()).then(res, rej); } catch (e) { return Promise.reject(e).then(res, rej); } },
    };
    return b;
  };
  return { client: { from: q }, tables };
}
