import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../utils/database';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  const db = getDb();
  const { search, role, team } = req.query;

  const where: any = {};
  if (search && typeof search === 'string') {
    const s = search.trim();
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
    ];
  }
  if (role && typeof role === 'string') {
    where.role = role;
  }
  if (team && typeof team === 'string') {
    where.teamMemberships = { some: { teamId: team } };
  }

  const users = await db.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      slackUserId: true,
      createdAt: true,
      teamMemberships: {
        select: { team: { select: { id: true, name: true } }, role: true },
      },
      notificationRules: {
        select: { method: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  // Mask phone numbers - just indicate presence
  const masked = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    hasPhone: !!u.phone,
    hasSlack: !!u.slackUserId,
    createdAt: u.createdAt,
    teams: u.teamMemberships.map((tm) => ({ id: tm.team.id, name: tm.team.name, role: tm.role })),
    contactMethods: [...new Set(u.notificationRules.map((nr) => nr.method))],
  }));

  res.json(masked);
});

router.get('/:id', async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      slackUserId: true,
      createdAt: true,
      teamMemberships: {
        select: { team: { select: { id: true, name: true } }, role: true },
      },
      notificationRules: {
        select: { method: true },
      },
      scheduleMembers: {
        select: { schedule: { select: { id: true, name: true } } },
      },
    },
  });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    hasPhone: !!user.phone,
    hasSlack: !!user.slackUserId,
    createdAt: user.createdAt,
    teams: user.teamMemberships.map((tm) => ({ id: tm.team.id, name: tm.team.name, role: tm.role })),
    contactMethods: [...new Set(user.notificationRules.map((nr) => nr.method))],
    schedules: user.scheduleMembers.map((sm) => ({ id: sm.schedule.id, name: sm.schedule.name })),
  });
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
