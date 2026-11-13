// Shake detection from phone motion sensors. Pure logic (testable); the browser wiring lives in alert.tsx.
/** Minimum total acceleration (m/s^2) that counts as a shake spike. Resting = 9.8. Higher sensitivity (5) = a gentler shake counts. */
export const thresholdFor = (sensitivity: number) => ({ 1: 27, 2: 22, 3: 18, 4: 15, 5: 12 } as Record<number, number>)[sensitivity] ?? 18;

export class ShakeDetector {
  private spikes: number[] = [];
  private last = -Infinity;
  constructor(private sensitivity: number, private onShake: () => void, private required = 4, private windowMs = 1800, private minGapMs = 120, private onProgress?: (n: number) => void) {}
  setSensitivity(s: number) { this.sensitivity = s; }
  /** Feed one reading of acceleration INCLUDING gravity (m/s^2) at time t (ms). */
  push(x: number | null, y: number | null, z: number | null, t: number) {
    if (x == null || y == null || z == null) return;
    const magnitude = Math.hypot(x, y, z);               // resting phone is about 9.8 (just gravity)
    if (magnitude < thresholdFor(this.sensitivity) || t - this.last < this.minGapMs) return;
    this.last = t;
    this.spikes = this.spikes.filter(s => t - s <= this.windowMs); this.spikes.push(t);
    this.onProgress?.(this.spikes.length);
    if (this.spikes.length >= this.required) { this.spikes = []; this.onProgress?.(0); this.onShake(); }
  }
  get count() { return this.spikes.length; }
}
