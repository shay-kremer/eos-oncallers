import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../utils/database';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const createServiceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  teamId: z.string().uuid(),
  escalationPolicyId: z.string().uuid().optional(),
});

router.get('/', async (_req: Request, res: Response) => {
  const db = getDb();
  const services = await db.service.findMany({
    include: { team: { select: { id: true, name: true } }, escalationPolicy: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(services);
});

router.get('/:id', async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  const service = await db.service.findUnique({
    where: { id },
    include: {
      team: true,
      escalationPolicy: { include: { levels: { include: { targets: true }, orderBy: { level: 'asc' } } } },
      integrations: true,
      alertRules: true,
    },
  });
  if (!service) { res.status(404).json({ error: 'Service not found' }); return; }
  res.json(service);
});

router.post('/', authorize('ADMIN', 'GROUP_LEADER'), async (req: Request, res: Response) => {
  const parsed = createServiceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() }); return; }

  const db = getDb();
  const service = await db.service.create({ data: parsed.data });
  res.status(201).json(service);
});

router.put('/:id', authorize('ADMIN', 'GROUP_LEADER'), async (req: Request, res: Response) => {
  const parsed = createServiceSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }

  const db = getDb();
  const id = req.params.id as string;
  const service = await db.service.update({ where: { id }, data: parsed.data });
  res.json(service);
});

router.delete('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  await db.service.delete({ where: { id } });
  res.status(204).send();
});

export default router;
