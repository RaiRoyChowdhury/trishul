import type { Lang } from '../locales';
export const LOCALE: Record<Lang, string> = { bn: 'bn-IN', hi: 'hi-IN', en: 'en-IN' };
const SRctor = (): any => (typeof window === 'undefined' ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null);
export const speechRecognitionSupported = () => !!SRctor();
export const speechSynthesisSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export interface Recognizer { start(): void; stop(): void }
/** Wraps the browser SpeechRecognition. With keepAlive it restarts itself (browsers stop it after silence). */
export function createRecognizer(o: { lang: Lang; keepAlive?: boolean; onText: (text: string, final: boolean) => void; onError?: (code: string) => void; onEnd?: () => void }): Recognizer {
  const C = SRctor();
  let rec: any = null, wanted = false;
  const make = () => {
    rec = new C(); rec.lang = LOCALE[o.lang]; rec.continuous = !!o.keepAlive; rec.interimResults = true; rec.maxAlternatives = 3;
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        for (let a = 0; a < r.length; a++) o.onText(r[a].transcript, r.isFinal);
      }
    };
    rec.onerror = (e: any) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') wanted = false; if (e.error !== 'no-speech' && e.error !== 'aborted') o.onError?.(e.error); };
    rec.onend = () => { if (wanted && o.keepAlive) { try { make(); rec.start(); } catch { wanted = false; o.onEnd?.(); } } else { wanted = false; o.onEnd?.(); } };
  };
  return {
    start() { if (!C) { o.onError?.('unsupported'); return; } wanted = true; make(); try { rec.start(); } catch { o.onError?.('start-failed'); } },
    stop() { wanted = false; try { rec?.stop(); } catch { /* already stopped */ } },
  };
}

/** Device (browser) text-to-speech: real synthesis, but quality for Bengali depends on the phone. */
export function speakDevice(text: string, lang: Lang): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!speechSynthesisSupported()) { reject(new Error('unsupported')); return; }
    const u = new SpeechSynthesisUtterance(text); u.lang = LOCALE[lang];
    const v = speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith(lang));
    if (v) u.voice = v;
    u.onend = () => resolve(); u.onerror = () => reject(new Error('speech failed'));
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  });
}

export async function micPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  try { const s = await navigator.permissions.query({ name: 'microphone' as PermissionName }); return s.state; } catch { return navigator.mediaDevices ? 'prompt' : 'unsupported'; }
}
export async function geoPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  if (!navigator.geolocation) return 'unsupported';
  try { return (await navigator.permissions.query({ name: 'geolocation' })).state; } catch { return 'prompt'; }
}
export const motionSupported = () => typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
export const needsMotionPermission = () => typeof (window as any).DeviceMotionEvent?.requestPermission === 'function';
export async function requestMotion(): Promise<boolean> {
  if (!motionSupported()) return false;
  if (needsMotionPermission()) { try { return (await (window as any).DeviceMotionEvent.requestPermission()) === 'granted'; } catch { return false; } }
  return true;
}
