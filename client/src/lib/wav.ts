// Turns any recorded or uploaded audio into a mono 16-bit WAV (max 15 s) so the server can send it to the cloning service.
export const MAX_SAMPLE_SECONDS = 15;
export const MIN_SAMPLE_SECONDS = 5;
export const WAV_RATE = 24000;

export function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2); const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}

export async function toWav(input: Blob): Promise<{ wav: Blob; seconds: number }> {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const decoded = await ctx.decodeAudioData(await input.arrayBuffer());
    const secs = Math.min(decoded.duration, MAX_SAMPLE_SECONDS);
    const off = new OfflineAudioContext(1, Math.max(1, Math.round(secs * WAV_RATE)), WAV_RATE);   // mixes down to mono and resamples
    const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
    const out = await off.startRendering();
    return { wav: encodeWav(out.getChannelData(0), WAV_RATE), seconds: secs };
  } finally { void ctx.close(); }
}
