import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../utils/database';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const createScheduleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  timezone: z.string().default('UTC'),
});

const createLayerSchema = z.object({
  name: z.string().min(1),
  priority: z.number().int().min(0),
  rotationType: z.enum(['daily', 'weekly', 'custom']).default('weekly'),
  handoffTime: z.string().default('09:00'),
  handoffDay: z.number().int().min(0).max(6).optional(),
  startDate: z.string().transform(s => new Date(s)),
  endDate: z.string().transform(s => new Date(s)).optional(),
  members: z.array(z.string().uuid()).min(1),
});

const createOverrideSchema = z.object({
  userId: z.string().uuid(),
  startTime: z.string().transform(s => new Date(s)),
  endTime: z.string().transform(s => new Date(s)),
  reason: z.string().optional(),
});

router.get('/', async (_req: Request, res: Response) => {
  const db = getDb();
  const schedules = await db.schedule.findMany({
    include: { layers: { orderBy: { priority: 'asc' } }, members: { include: { user: { select: { id: true, name: true } } } } },
    orderBy: { name: 'asc' },
  });
  res.json(schedules);
});

router.get('/:id', async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  const schedule = await db.schedule.findUnique({
    where: { id },
    include: {
      layers: { include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } }, orderBy: { priority: 'asc' } },
      overrides: { include: { user: { select: { id: true, name: true } } }, where: { endTime: { gte: new Date() } }, orderBy: { startTime: 'asc' } },
    },
  });
  if (!schedule) { res.status(404).json({ error: 'Schedule not found' }); return; }
  res.json(schedule);
});

router.post('/', authorize('ADMIN', 'GROUP_LEADER'), async (req: Request, res: Response) => {
  const parsed = createScheduleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() }); return; }

  const db = getDb();
  const schedule = await db.schedule.create({ data: parsed.data });
  res.status(201).json(schedule);
});

router.post('/:id/layers', authorize('ADMIN', 'GROUP_LEADER'), async (req: Request, res: Response) => {
  const parsed = createLayerSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() }); return; }

  const db = getDb();
  const scheduleId = req.params.id as string;
  const { members, ...layerData } = parsed.data;

  const layer = await db.scheduleLayer.create({
    data: { ...layerData, scheduleId },
  });

  await Promise.all(members.map((userId, idx) =>
    db.scheduleMember.create({
      data: { userId, scheduleId, layerId: layer.id, position: idx },
    })
  ));

  const result = await db.scheduleLayer.findUnique({
    where: { id: layer.id },
    include: { members: { include: { user: { select: { id: true, name: true } } } } },
  });
  res.status(201).json(result);
});

router.post('/:id/overrides', authenticate, async (req: Request, res: Response) => {
  const parsed = createOverrideSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() }); return; }

  const db = getDb();
  const scheduleId = req.params.id as string;
  const override = await db.scheduleOverride.create({
    data: { ...parsed.data, scheduleId },
    include: { user: { select: { id: true, name: true } } },
  });
  res.status(201).json(override);
});

router.get('/:id/oncall', async (req: Request, res: Response) => {
  const db = getDb();
  const scheduleId = req.params.id as string;
  const now = new Date();

  const override = await db.scheduleOverride.findFirst({
    where: { scheduleId, startTime: { lte: now }, endTime: { gte: now } },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { startTime: 'desc' },
  });

  if (override) {
    res.json({ oncall: override.user, source: 'override' });
    return;
  }

  const schedule = await db.schedule.findUnique({
    where: { id: scheduleId },
    include: { layers: { include: { members: { include: { user: true }, orderBy: { position: 'asc' } } }, orderBy: { priority: 'desc' } } },
  });

  if (!schedule || schedule.layers.length === 0) {
    res.json({ oncall: null, source: 'none' });
    return;
  }

  const topLayer = schedule.layers[0];
  if (topLayer.members.length === 0) {
    res.json({ oncall: null, source: 'none' });
    return;
  }

  const daysSinceStart = Math.floor((now.getTime() - topLayer.startDate.getTime()) / (1000 * 60 * 60 * 24));
  let rotationIndex: number;
  if (topLayer.rotationType === 'daily') {
    rotationIndex = daysSinceStart % topLayer.members.length;
  } else {
    rotationIndex = Math.floor(daysSinceStart / 7) % topLayer.members.length;
  }

  const currentMember = topLayer.members[rotationIndex];
  res.json({
    oncall: { id: currentMember.user.id, name: currentMember.user.name, email: currentMember.user.email },
    source: 'schedule',
    layer: topLayer.name,
  });
});

export default router;
