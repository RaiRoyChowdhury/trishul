import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export function Badge({ tone = 'gold', children }: { tone?: 'gold' | 'ok' | 'red' | 'gray'; children: ReactNode }) {
  const c = { gold: 'bg-gold/25 text-crimson', ok: 'bg-ok/15 text-ok', red: 'bg-vermilion/15 text-vermilion', gray: 'bg-charcoal/10 text-charcoal/80' }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${c}`}>{children}</span>;
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-4 min-h-[48px] ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span className="text-[0.95rem]">{label}</span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full shadow-inner transition ${checked ? 'bg-crimson' : 'bg-charcoal/30'}`}>
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-7' : 'left-1'}`} />
      </button>
    </label>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block"><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-charcoal/70">{hint}</span>}</label>;
}

export function Notice({ tone = 'info', children, title }: { tone?: 'info' | 'warn' | 'ok' | 'error'; children: ReactNode; title?: string }) {
  const s = { info: 'bg-champagne border-gold/60 text-charcoal', warn: 'bg-amber-50 border-amber-400/70 text-charcoal', ok: 'bg-ok/10 border-ok/40 text-charcoal', error: 'bg-vermilion/10 border-vermilion/50 text-charcoal' }[tone];
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-2xl border p-3.5 text-sm shadow-sm ${s}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-crimson" aria-hidden />
      <div className="min-w-0">{title && <div className="font-semibold">{title}</div>}{children}</div>
    </div>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="mb-5">
      <h1 className="font-display text-2xl leading-snug text-crimson sm:text-3xl">{title}</h1>
      <div className="mt-2 h-1 w-14 rounded-full bg-gradient-to-r from-gold to-vermilion" aria-hidden />
      {sub && <p className="mt-2 max-w-2xl text-charcoal/80">{sub}</p>}
    </header>
  );
}

export function Spinner() { return <div className="p-8 text-center text-crimson" role="status">…</div>; }
