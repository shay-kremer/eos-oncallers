import { Router, Request, Response } from 'express';
import { getDb } from '../utils/database';
import { authenticate, authorize } from '../middleware/auth';
import { getConfig } from '../utils/config';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  const config = getConfig();
  const db = getDb();

  const integrationCount = await db.serviceIntegration.count();

  // Only show integration status (configured or not), never expose secrets
  const integrations = {
    slack: { configured: !!config.SLACK_BOT_TOKEN, label: 'Slack' },
    twilio: { configured: !!config.TWILIO_ACCOUNT_SID, label: 'Twilio (SMS/Voice)' },
    datadog: { configured: !!config.DATADOG_API_KEY, label: 'Datadog' },
    aws: { configured: !!config.AWS_WEBHOOK_URL, label: 'AWS (CloudWatch/SNS)' },
  };

  const currentUser = {
    id: req.user!.userId,
    email: req.user!.email,
    role: req.user!.role,
  };

  res.json({
    environment: config.NODE_ENV,
    integrations,
    serviceIntegrationCount: integrationCount,
    currentUser,
    features: {
      notifications: integrations.slack.configured || integrations.twilio.configured,
      webhooks: true,
      statusPages: true,
      alertRules: true,
      scheduleOverrides: true,
    },
  });
});

// Demo-only: show integration key in dev
router.get('/demo-key', async (_req: Request, res: Response) => {
  const config = getConfig();
  if (config.NODE_ENV !== 'development') {
    res.status(403).json({ error: 'Only available in development' });
    return;
  }
  const db = getDb();
  const integration = await db.serviceIntegration.findFirst({
    where: { enabled: true },
    select: { integrationKey: true, name: true, service: { select: { name: true } } },
  });
  res.json(integration || { message: 'No integrations configured' });
});

export default router;
