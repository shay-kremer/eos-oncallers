import 'express-async-errors';
import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from './utils/logger';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import teamRoutes from './routes/teams';
import serviceRoutes from './routes/services';
import incidentRoutes from './routes/incidents';
import scheduleRoutes from './routes/schedules';
import escalationPolicyRoutes from './routes/escalation-policies';
import alertRuleRoutes from './routes/alert-rules';
import statusPageRoutes from './routes/status-pages';
import webhookRoutes from './routes/webhooks';
import dashboardRoutes from './routes/dashboard';
import analyticsRoutes from './routes/analytics';
import activityLogRoutes from './routes/activity-log';
import settingsRoutes from './routes/settings';

export function createApp() {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: false,
  }));
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);

  app.use((req, _res, next) => {
    logger.info({ method: req.method, path: req.path }, 'request');
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/teams', teamRoutes);
  app.use('/api/services', serviceRoutes);
  app.use('/api/incidents', incidentRoutes);
  app.use('/api/schedules', scheduleRoutes);
  app.use('/api/escalation-policies', escalationPolicyRoutes);
  app.use('/api/alert-rules', alertRuleRoutes);
  app.use('/api/status-pages', statusPageRoutes);
  app.use('/api/webhooks', webhookRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/activity-log', activityLogRoutes);
  app.use('/api/settings', settingsRoutes);

  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, 'Unhandled error');
    if (err.constructor?.name === 'PrismaClientInitializationError' || err.message?.includes("Can't reach database")) {
      res.status(503).json({ error: 'Database unavailable. Ensure Docker is running: docker compose up -d postgres' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
