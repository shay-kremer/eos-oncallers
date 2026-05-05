import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../utils/database';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const createPolicySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  repeatCount: z.number().int().min(1).max(10).default(3),
  levels: z.array(z.object({
    level: z.number().int().min(1),
    delayMinutes: z.number().int().min(1).default(5),
    targets: z.array(z.object({
      targetType: z.enum(['USER', 'SCHEDULE']),
      targetId: z.string().uuid(),
    })),
  })).min(1),
});

router.get('/', async (_req: Request, res: Response) => {
  const db = getDb();
  const policies = await db.escalationPolicy.findMany({
    include: { levels: { include: { targets: true }, orderBy: { level: 'asc' } } },
    orderBy: { name: 'asc' },
  });
  res.json(policies);
});

router.get('/:id', async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  const policy = await db.escalationPolicy.findUnique({
    where: { id },
    include: { levels: { include: { targets: true }, orderBy: { level: 'asc' } }, services: { select: { id: true, name: true } } },
  });
  if (!policy) { res.status(404).json({ error: 'Policy not found' }); return; }
  res.json(policy);
});

router.post('/', authorize('ADMIN', 'GROUP_LEADER'), async (req: Request, res: Response) => {
  const parsed = createPolicySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() }); return; }

  const db = getDb();
  const { levels, ...policyData } = parsed.data;

  const policy = await db.escalationPolicy.create({
    data: {
      ...policyData,
      levels: {
        create: levels.map(l => ({
          level: l.level,
          delayMinutes: l.delayMinutes,
          targets: { create: l.targets },
        })),
      },
    },
    include: { levels: { include: { targets: true }, orderBy: { level: 'asc' } } },
  });

  res.status(201).json(policy);
});

router.delete('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  await db.escalationPolicy.delete({ where: { id } });
  res.status(204).send();
});

export default router;
