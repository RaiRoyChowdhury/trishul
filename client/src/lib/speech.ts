import type { Lang } from '../locales';
export const LOCALE: Record<Lang, string> = { bn: 'bn-IN', hi: 'hi-IN', en: 'en-IN' };
const SRctor = (): any => (typeof window === 'undefined' ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null);
/** Android app shell (Capacitor): WebView has no SpeechRecognition, so the native plugin @capacitor-community/speech-recognition is used. */
interface NativeSR { available(): Promise<{ available: boolean }>; requestPermissions(): Promise<unknown>; start(o: object): Promise<unknown>; stop(): Promise<unknown>; addListener(ev: string, fn: (d: any) => void): Promise<{ remove(): Promise<void> }> }
const nativeSR = (): NativeSR | null => ((globalThis as any).Capacitor?.isNativePlatform?.() ? ((globalThis as any).Capacitor?.Plugins?.SpeechRecognition as NativeSR | undefined) ?? null : null);
export const usingNativeSpeech = () => !!nativeSR();
export const speechRecognitionSupported = () => !!SRctor() || !!nativeSR();
export const speechSynthesisSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export interface Recognizer { start(): void; stop(): void }
/** Wraps the browser SpeechRecognition. With keepAlive it restarts itself (browsers stop it after silence). */
export function createRecognizer(o: { lang: Lang; keepAlive?: boolean; onText: (text: string, final: boolean) => void; onError?: (code: string) => void; onEnd?: () => void }): Recognizer {
   const N = nativeSR();
  if (N) return createNativeRecognizer(N, o);
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
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';

  try {
    const status = await navigator.permissions.query({
      name: 'microphone' as PermissionName
    });
    return status.state;
  } catch {
    return 'prompt';
  }
}

export async function requestMicPermission(): Promise<boolean> {
  if (usingNativeSpeech()) return true;
  if (!navigator.mediaDevices?.getUserMedia) return false;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (error) {
    console.error('Microphone permission error:', error);
    return false;
  }
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
function createNativeRecognizer(N: NativeSR, o: { lang: Lang; keepAlive?: boolean; onText: (text: string, final: boolean) => void; onError?: (code: string) => void; onEnd?: () => void }): Recognizer {
  let wanted = false, last = '', subs: { remove(): Promise<void> }[] = [];
  const clean = async () => { for (const x of subs) { try { await x.remove(); } catch { /* gone */ } } subs = []; };
  const run = async () => {
    last = '';
    try {
      await N.requestPermissions();
      subs.push(await N.addListener('partialResults', (d: any) => { const t = d?.matches?.[0]; if (typeof t === 'string' && t) { last = t; o.onText(t, false); } }));
      subs.push(await N.addListener('listeningState', (d: any) => {
        if (d?.status !== 'stopped') return;
        if (last) { o.onText(last, true); last = ''; }
        void clean().then(() => { if (wanted && o.keepAlive) void run(); else { wanted = false; o.onEnd?.(); } });
      }));
      await N.start({ language: LOCALE[o.lang], maxResults: 3, partialResults: true, popup: false });
    } catch (e: any) { wanted = false; await clean(); o.onError?.(/permission|denied/i.test(String(e?.message ?? e)) ? 'not-allowed' : 'start-failed'); }
  };
  return {
    start() { wanted = true; void run(); },
    stop() { wanted = false; void N.stop().catch(() => undefined); void clean(); },
  };
}