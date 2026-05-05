import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../utils/database';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const createRuleSchema = z.object({
  serviceId: z.string().uuid(),
  name: z.string().min(1),
  condition: z.object({
    field: z.string(),
    operator: z.enum(['equals', 'contains', 'regex', 'gt', 'lt']),
    value: z.union([z.string(), z.number()]),
  }),
  severity: z.enum(['CRITICAL', 'ERROR', 'WARNING', 'INFO']).default('ERROR'),
  urgency: z.enum(['HIGH', 'LOW']).default('HIGH'),
  enabled: z.boolean().default(true),
});

router.get('/', async (req: Request, res: Response) => {
  const db = getDb();
  const serviceId = req.query.serviceId as string | undefined;
  const where = serviceId ? { serviceId } : {};
  const rules = await db.alertRule.findMany({ where, include: { service: { select: { id: true, name: true } } }, orderBy: { name: 'asc' } });
  res.json(rules);
});

router.post('/', authorize('ADMIN', 'GROUP_LEADER'), async (req: Request, res: Response) => {
  const parsed = createRuleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() }); return; }

  const db = getDb();
  const rule = await db.alertRule.create({ data: { ...parsed.data, condition: parsed.data.condition as object } });
  res.status(201).json(rule);
});

router.patch('/:id', authorize('ADMIN', 'GROUP_LEADER'), async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  const rule = await db.alertRule.update({ where: { id }, data: req.body });
  res.json(rule);
});

router.delete('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  await db.alertRule.delete({ where: { id } });
  res.status(204).send();
});

export default router;
