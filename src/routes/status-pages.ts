import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../utils/database';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const createStatusPageSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
});

const subscribeSchema = z.object({
  email: z.string().email(),
  webhook: z.string().url().optional(),
});

router.get('/', async (_req: Request, res: Response) => {
  const db = getDb();
  const pages = await db.statusPage.findMany({
    include: { components: true, _count: { select: { subscribers: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(pages);
});

router.get('/:id', async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  const page = await db.statusPage.findUnique({
    where: { id },
    include: { components: true, subscribers: true },
  });
  if (!page) { res.status(404).json({ error: 'Status page not found' }); return; }
  res.json(page);
});

router.post('/', authorize('ADMIN', 'GROUP_LEADER'), async (req: Request, res: Response) => {
  const parsed = createStatusPageSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }

  const db = getDb();
  const page = await db.statusPage.create({ data: parsed.data });
  res.status(201).json(page);
});

router.post('/:id/subscribe', async (req: Request, res: Response) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }

  const db = getDb();
  const statusPageId = req.params.id as string;
  const sub = await db.statusPageSubscription.upsert({
    where: { statusPageId_email: { statusPageId, email: parsed.data.email } },
    create: { statusPageId, ...parsed.data },
    update: { webhook: parsed.data.webhook },
  });
  res.status(201).json(sub);
});

router.post('/:id/components', authorize('ADMIN', 'GROUP_LEADER'), async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) { res.status(400).json({ error: 'name required' }); return; }

  const db = getDb();
  const statusPageId = req.params.id as string;
  const component = await db.statusPageComponent.create({ data: { statusPageId, name: name as string } });
  res.status(201).json(component);
});

router.patch('/:id/components/:componentId', authorize('ADMIN', 'GROUP_LEADER'), async (req: Request, res: Response) => {
  const { status } = req.body;
  if (!status) { res.status(400).json({ error: 'status required' }); return; }

  const db = getDb();
  const componentId = req.params.componentId as string;
  const component = await db.statusPageComponent.update({
    where: { id: componentId },
    data: { status: status as string },
  });
  res.json(component);
});

export default router;
