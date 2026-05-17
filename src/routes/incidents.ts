import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { getDb } from '../utils/database';
import { authenticate } from '../middleware/auth';
import { IncidentUrgency, AlertSeverity, IncidentStatus } from '../types';
import { notifyIncident } from '../services/notification';

const router = Router();
router.use(authenticate);

const createIncidentSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  serviceId: z.string().uuid(),
  urgency: z.nativeEnum(IncidentUrgency).optional(),
  severity: z.nativeEnum(AlertSeverity).optional(),
  dedupKey: z.string().optional(),
});

router.get('/', async (req: Request, res: Response) => {
  const db = getDb();
  const status = req.query.status as string | undefined;
  const serviceId = req.query.serviceId as string | undefined;
  const urgency = req.query.urgency as string | undefined;

  const where: Prisma.IncidentWhereInput = {};
  if (status) where.status = status as IncidentStatus;
  if (serviceId) where.serviceId = serviceId;
  if (urgency) where.urgency = urgency as IncidentUrgency;

  const incidents = await db.incident.findMany({
    where,
    include: {
      service: { select: { id: true, name: true } },
      assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(incidents);
});

router.get('/:id', async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  const incident = await db.incident.findUnique({
    where: { id },
    include: {
      service: true,
      assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
      alerts: true,
      timeline: { orderBy: { createdAt: 'asc' } },
      acknowledgedBy: { select: { id: true, name: true } },
      resolvedBy: { select: { id: true, name: true } },
    },
  });
  if (!incident) { res.status(404).json({ error: 'Incident not found' }); return; }
  res.json(incident);
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = createIncidentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() }); return; }

  const db = getDb();
  const { dedupKey, ...data } = parsed.data;

  if (dedupKey) {
    const existing = await db.incident.findUnique({ where: { dedupKey } });
    if (existing && existing.status !== 'RESOLVED') {
      res.json(existing);
      return;
    }
  }

  const incident = await db.incident.create({
    data: { ...data, dedupKey },
  });

  await db.incidentTimeline.create({
    data: { incidentId: incident.id, type: 'created', message: `Incident triggered: ${incident.title}` },
  });

  await notifyIncident(incident.id);
  res.status(201).json(incident);
});

router.post('/:id/acknowledge', async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  const incident = await db.incident.findUnique({ where: { id } });
  if (!incident) { res.status(404).json({ error: 'Incident not found' }); return; }
  if (incident.status === 'RESOLVED') { res.status(400).json({ error: 'Incident already resolved' }); return; }

  const updated = await db.incident.update({
    where: { id },
    data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedById: req.user!.userId },
  });

  await db.incidentTimeline.create({
    data: { incidentId: id, type: 'acknowledged', message: `Acknowledged by ${req.user!.email}` },
  });

  res.json(updated);
});

router.post('/:id/resolve', async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  const incident = await db.incident.findUnique({ where: { id } });
  if (!incident) { res.status(404).json({ error: 'Incident not found' }); return; }
  if (incident.status === 'RESOLVED') { res.status(400).json({ error: 'Already resolved' }); return; }

  const updated = await db.incident.update({
    where: { id },
    data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedById: req.user!.userId },
  });

  await db.incidentTimeline.create({
    data: { incidentId: id, type: 'resolved', message: `Resolved by ${req.user!.email}` },
  });

  res.json(updated);
});

router.post('/:id/reassign', async (req: Request, res: Response) => {
  const { userId } = req.body;
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }

  const db = getDb();
  const id = req.params.id as string;
  await db.incidentAssignment.upsert({
    where: { incidentId_userId: { incidentId: id, userId: userId as string } },
    create: { incidentId: id, userId: userId as string },
    update: {},
  });

  await db.incidentTimeline.create({
    data: { incidentId: id, type: 'reassigned', message: `Reassigned to user ${userId}` },
  });

  res.json({ success: true });
});

export default router;
