// Pure rules for the countdown + cooldown (kept separate so they are easy to test).
export type Source = 'secret_code' | 'no_touch_voice' | 'no_touch_shake' | 'manual';
export const secondsLeft = (deadline: number, now: number) => Math.max(0, Math.ceil((deadline - now) / 1000));
export const cooldownLeft = (until: number, now: number) => Math.max(0, Math.ceil((until - now) / 1000));
/** Manual SOS is never blocked. Automatic triggers (voice/shake) respect the cooldown to stop repeat false alarms. */
export function canTrigger(source: Source, mode: 'live' | 'test', until: number, now: number) {
  if (source === 'manual' || mode === 'test') return true;
  return now >= until;
}
