import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env, serviceStatus } from './config.js';
import { errorHandler, limiter } from './lib.js';
import me from './routes/me.js';
import call from './routes/call.js';
import map from './routes/map.js';
import sos from './routes/sos.js';
import journeys from './routes/journeys.js';
import admin from './routes/admin.js';
import trustpass from './routes/trustpass.js';
import shakti from './routes/shakti.js';
import evidence from './routes/evidence.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin }));
  app.use(express.json({ limit: '50kb' }));
  app.use(limiter(60_000, 300));                       // global safety net per IP
  app.get('/api/health', (_req, res) => res.json({ ok: true, services: serviceStatus() }));
  app.use('/api', me, call, map, sos, journeys, admin, trustpass, shakti, evidence);
  app.use('/api', (_req, res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown endpoint.' } }); });
  app.use(errorHandler);
  return app;
}
