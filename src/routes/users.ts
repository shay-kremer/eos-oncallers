import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../utils/database';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types';

const router = Router();

router.use(authenticate);

router.get('/', async (_req: Request, res: Response) => {
  const db = getDb();
  const users = await db.user.findMany({
    select: { id: true, email: true, name: true, role: true, phone: true, createdAt: true },
    orderBy: { name: 'asc' },
  });
  res.json(users);
});

router.get('/:id', async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, phone: true, slackUserId: true, createdAt: true },
  });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(user);
});

const updateRoleSchema = z.object({ role: z.nativeEnum(UserRole) });

router.patch('/:id/role', authorize('ADMIN'), async (req: Request, res: Response) => {
  const parsed = updateRoleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid role' }); return; }

  const db = getDb();
  const id = req.params.id as string;
  const user = await db.user.update({
    where: { id },
    data: { role: parsed.data.role },
    select: { id: true, email: true, name: true, role: true },
  });
  res.json(user);
});

export default router;
