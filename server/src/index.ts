import { createApp } from './app.js';
import { env, serviceStatus } from './config.js';

createApp().listen(env.port, () => {
  console.log(`TRISHUL server running on http://localhost:${env.port}`);
  const s = serviceStatus();
  for (const [k, v] of Object.entries(s)) console.log(`  ${v ? '[ready]  ' : '[missing]'} ${k}`);
  if (!s.supabase) console.log('\nSupabase is not configured yet: copy .env.example to .env and fill it in (see docs/SETUP-WINDOWS.md).');
});
