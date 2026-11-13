import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { api } from '../lib/api';

/** Loads a person's photo through the authenticated API (the server decides who may see it). Falls back to initials. */
export function Avatar({ userId, name, show, size = 64, refresh }: { userId: string; name: string; show: boolean; size?: number; refresh?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let dead = false, made: string | null = null; setUrl(null);
    if (show) api.getBlob(`/people/${userId}/photo`).then(b => { if (!dead) { made = URL.createObjectURL(b); setUrl(made); } }).catch(() => undefined);
    return () => { dead = true; if (made) URL.revokeObjectURL(made); };
  }, [userId, show, refresh]);
  const s = { width: size, height: size };
  return url ? <img src={url} alt={name} style={s} className="shrink-0 rounded-2xl border-2 border-gold object-cover shadow-md" />
    : <span style={s} className="grid shrink-0 place-items-center rounded-2xl border-2 border-gold/50 bg-champagne text-crimson" aria-hidden>{name && name !== 'Teen walker' ? <span className="font-display text-2xl">{name.slice(0, 1)}</span> : <User className="h-1/2 w-1/2" />}</span>;
}
