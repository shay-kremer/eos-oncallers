import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { getDb } from '../utils/database';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;
  const resource = req.query.resource as string | undefined;

  const where: Prisma.ActivityLogWhereInput = {};
  if (resource) where.resource = resource;

  const [logs, total] = await Promise.all([
    db.activityLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.activityLog.count({ where }),
  ]);

  res.json({ logs, total, limit, offset });
});

export default router;
