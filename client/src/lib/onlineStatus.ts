/** Online only when the browser says so AND the server answered a recent check (navigator.onLine alone is unreliable). */
export type Net = 'online' | 'offline' | 'checking';
export function decideNet(navigatorOnline: boolean, probe: 'ok' | 'fail' | 'none'): Net {
  if (!navigatorOnline) return 'offline';
  if (probe === 'fail') return 'offline';
  return probe === 'ok' ? 'online' : 'checking';
}
