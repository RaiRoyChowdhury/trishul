import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { hashPhrase, newSalt, normalize, phraseStore, verifyPhrase, type PhraseKind } from '../lib/phrase';
import { LANGS, type Lang } from '../locales';
import { Badge, Field, Notice } from './ui';

/** Create / change a secret phrase. Server gets salt+hash only; the readable phrase stays on this device. */
export function PhraseEditor({ kind }: { kind: PhraseKind }) {
  const { me, refreshMe } = useAuth(); const { t, err, lang } = useI18n();
  const uid = me!.profile.id, s = me!.settings;
  const hasServer = !!(kind === 'sos' ? s.sos_phrase_hash : s.nt_phrase_hash);
  const local = phraseStore.get(uid, kind);
  const [text, setText] = useState(local);
  const [pl, setPl] = useState<Lang>((kind === 'sos' ? s.sos_phrase_lang : s.nt_phrase_lang) ?? lang);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const save = async () => {
    setMsg(null);
    const v = text.trim(); if (v.length < 2) return;
    try {
      if (kind === 'nt') {   // the two triggers must differ
        const other = phraseStore.get(uid, 'sos');
        if (other && normalize(other) === normalize(v)) { setMsg({ tone: 'error', text: t('nt.same') }); return; }
        if (!other && s.sos_phrase_hash && s.sos_phrase_salt && await verifyPhrase(v, s.sos_phrase_salt, s.sos_phrase_hash)) { setMsg({ tone: 'error', text: t('nt.same') }); return; }
      }
      const salt = newSalt(), hash = await hashPhrase(v, salt);
      await api.put(`/me/phrase/${kind}`, { hash, salt, lang: pl });
      phraseStore.set(uid, kind, v); await refreshMe();
      setMsg({ tone: 'ok', text: t('sos.phraseSaved') });
    } catch (e) { setMsg({ tone: 'error', text: err(e) }); }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><span className="label !mb-0">{t(kind === 'sos' ? 'sos.phrase' : 'nt.phrase')}</span><Badge tone={hasServer ? 'ok' : 'gray'}>{hasServer ? t('home.set') : t('home.notSet')}</Badge></div>
      <Field label={t(kind === 'sos' ? 'sos.phrase' : 'nt.phrase')} hint={t(kind === 'sos' ? 'sos.phraseHint' : 'nt.phraseNote')}>
        <input className="input" value={text} onChange={e => setText(e.target.value)} maxLength={60} autoComplete="off" spellCheck={false} />
      </Field>
      <Field label={t('sos.phraseLang')}>
        <select className="input" value={pl} onChange={e => setPl(e.target.value as Lang)}>{LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}</select>
      </Field>
      <p className="text-xs text-charcoal/70">{t('sos.deviceOnly')}</p>
      {hasServer && !local && <Notice tone="warn">{t('sos.deviceOnly')}</Notice>}
      <button className="btn-primary" onClick={() => void save()} disabled={text.trim().length < 2}>{t('sos.savePhrase')}</button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
