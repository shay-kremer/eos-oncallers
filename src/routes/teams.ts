import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../utils/database';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const createTeamSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['ADMIN', 'GROUP_LEADER', 'USER']).default('USER'),
});

router.get('/', async (_req: Request, res: Response) => {
  const db = getDb();
  const teams = await db.team.findMany({
    include: { members: { include: { user: { select: { id: true, name: true, email: true } } } }, _count: { select: { services: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(teams);
});

router.post('/', authorize('ADMIN'), async (req: Request, res: Response) => {
  const parsed = createTeamSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }

  const db = getDb();
  const team = await db.team.create({ data: parsed.data });
  res.status(201).json(team);
});

router.post('/:id/members', authorize('ADMIN', 'GROUP_LEADER'), async (req: Request, res: Response) => {
  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }

  const db = getDb();
  const teamId = req.params.id as string;
  const member = await db.teamMember.create({
    data: { teamId, ...parsed.data },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.status(201).json(member);
});

router.delete('/:id/members/:userId', authorize('ADMIN', 'GROUP_LEADER'), async (req: Request, res: Response) => {
  const db = getDb();
  const teamId = req.params.id as string;
  const userId = req.params.userId as string;
  await db.teamMember.deleteMany({ where: { teamId, userId } });
  res.status(204).send();
});

export default router;
