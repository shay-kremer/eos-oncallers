import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../utils/database';
import { notifyIncident } from '../services/notification';
import { logger } from '../utils/logger';

const router = Router();

const eventSchema = z.object({
  routing_key: z.string(),
  event_action: z.enum(['trigger', 'acknowledge', 'resolve']),
  dedup_key: z.string().optional(),
  payload: z.object({
    summary: z.string(),
    source: z.string().optional(),
    severity: z.enum(['CRITICAL', 'ERROR', 'WARNING', 'INFO']).default('ERROR'),
    details: z.record(z.unknown()).optional(),
  }).optional(),
});

router.post('/events', async (req: Request, res: Response) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid event', details: parsed.error.flatten() }); return; }

  const { routing_key, event_action, dedup_key, payload } = parsed.data;
  const db = getDb();

  const integration = await db.serviceIntegration.findUnique({
    where: { integrationKey: routing_key },
    include: { service: true },
  });

  if (!integration || !integration.enabled) {
    res.status(404).json({ error: 'Invalid routing key' });
    return;
  }

  logger.info({ event_action, serviceId: integration.serviceId, dedup_key }, 'Webhook event received');

  if (event_action === 'trigger') {
    const dedupKey = dedup_key || `${integration.serviceId}-${Date.now()}`;
    const existing = await db.incident.findUnique({ where: { dedupKey } });
    if (existing && existing.status !== 'RESOLVED') {
      await db.alert.create({
        data: { incidentId: existing.id, serviceId: integration.serviceId, summary: payload?.summary || 'Alert', severity: payload?.severity || 'ERROR', source: payload?.source, details: payload?.details as object },
      });
      res.json({ status: 'deduplicated', incident_id: existing.id });
      return;
    }

    const incident = await db.incident.create({
      data: {
        title: payload?.summary || 'New incident',
        serviceId: integration.serviceId,
        severity: payload?.severity || 'ERROR',
        dedupKey,
      },
    });

    await db.alert.create({
      data: { incidentId: incident.id, serviceId: integration.serviceId, summary: payload?.summary || 'Alert', severity: payload?.severity || 'ERROR', source: payload?.source, details: payload?.details as object },
    });

    await db.incidentTimeline.create({
      data: { incidentId: incident.id, type: 'created', message: `Triggered via integration: ${integration.name}` },
    });

    await notifyIncident(incident.id);
    res.status(201).json({ status: 'triggered', incident_id: incident.id, dedup_key: dedupKey });

  } else if (event_action === 'acknowledge') {
    if (!dedup_key) { res.status(400).json({ error: 'dedup_key required for acknowledge' }); return; }
    const incident = await db.incident.findUnique({ where: { dedupKey: dedup_key } });
    if (!incident) { res.status(404).json({ error: 'Incident not found' }); return; }

    await db.incident.update({ where: { id: incident.id }, data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() } });
    res.json({ status: 'acknowledged', incident_id: incident.id });

  } else if (event_action === 'resolve') {
    if (!dedup_key) { res.status(400).json({ error: 'dedup_key required for resolve' }); return; }
    const incident = await db.incident.findUnique({ where: { dedupKey: dedup_key } });
    if (!incident) { res.status(404).json({ error: 'Incident not found' }); return; }

    await db.incident.update({ where: { id: incident.id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
    res.json({ status: 'resolved', incident_id: incident.id });
  }
});

router.post('/datadog', async (req: Request, res: Response) => {
  const db = getDb();
  const { routing_key } = req.query;
  if (!routing_key || typeof routing_key !== 'string') { res.status(400).json({ error: 'routing_key query param required' }); return; }

  const integration = await db.serviceIntegration.findUnique({ where: { integrationKey: routing_key } });
  if (!integration || !integration.enabled) { res.status(404).json({ error: 'Invalid routing key' }); return; }

  const body = req.body;
  const title = body.title || body.event_title || 'Datadog Alert';
  const severity = body.priority === 'P1' ? 'CRITICAL' : body.priority === 'P2' ? 'ERROR' : 'WARNING';
  const dedupKey = body.alert_id ? `dd-${body.alert_id}` : `dd-${integration.serviceId}-${Date.now()}`;

  const existing = await db.incident.findUnique({ where: { dedupKey } });
  if (existing && existing.status !== 'RESOLVED') {
    res.json({ status: 'deduplicated', incident_id: existing.id });
    return;
  }

  const incident = await db.incident.create({
    data: { title, serviceId: integration.serviceId, severity, dedupKey, description: body.body || body.event_msg },
  });

  await notifyIncident(incident.id);
  res.status(201).json({ status: 'triggered', incident_id: incident.id });
});

export default router;
