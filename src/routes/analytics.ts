import { Router, Request, Response } from 'express';
import { getDb } from '../utils/database';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/summary', async (_req: Request, res: Response) => {
  const db = getDb();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalIncidents,
    incidentsByStatus,
    incidentsBySeverity,
    recentIncidents,
    avgAckTime,
    avgResolveTime,
    incidentsByService,
  ] = await Promise.all([
    db.incident.count(),
    db.incident.groupBy({ by: ['status'], _count: true }),
    db.incident.groupBy({ by: ['severity'], _count: true }),
    db.incident.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    db.incident.aggregate({
      where: { acknowledgedAt: { not: null }, createdAt: { gte: thirtyDaysAgo } },
      _avg: { number: true },
    }),
    db.incident.aggregate({
      where: { resolvedAt: { not: null }, createdAt: { gte: thirtyDaysAgo } },
      _avg: { number: true },
    }),
    db.incident.groupBy({
      by: ['serviceId'],
      _count: true,
      where: { createdAt: { gte: thirtyDaysAgo } },
      orderBy: { _count: { serviceId: 'desc' } },
      take: 10,
    }),
  ]);

  // Calculate avg ack/resolve times from raw data
  const ackedIncidents = await db.incident.findMany({
    where: { acknowledgedAt: { not: null }, createdAt: { gte: thirtyDaysAgo } },
    select: { createdAt: true, acknowledgedAt: true },
    take: 200,
  });
  const resolvedIncidents = await db.incident.findMany({
    where: { resolvedAt: { not: null }, createdAt: { gte: thirtyDaysAgo } },
    select: { createdAt: true, resolvedAt: true },
    take: 200,
  });

  const avgAckMinutes = ackedIncidents.length > 0
    ? ackedIncidents.reduce((sum, i) => sum + (new Date(i.acknowledgedAt!).getTime() - new Date(i.createdAt).getTime()) / 60000, 0) / ackedIncidents.length
    : null;

  const avgResolveMinutes = resolvedIncidents.length > 0
    ? resolvedIncidents.reduce((sum, i) => sum + (new Date(i.resolvedAt!).getTime() - new Date(i.createdAt).getTime()) / 60000, 0) / resolvedIncidents.length
    : null;

  // Get service names for the by-service breakdown
  const serviceIds = incidentsByService.map(s => s.serviceId);
  const services = serviceIds.length > 0
    ? await db.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, name: true } })
    : [];
  const serviceMap = new Map(services.map(s => [s.id, s.name]));

  const byStatus: Record<string, number> = {};
  for (const g of incidentsByStatus) { byStatus[g.status] = g._count; }

  const bySeverity: Record<string, number> = {};
  for (const g of incidentsBySeverity) { bySeverity[g.severity] = g._count; }

  const byService = incidentsByService.map(s => ({
    serviceId: s.serviceId,
    serviceName: serviceMap.get(s.serviceId) || 'Unknown',
    count: s._count,
  }));

  res.json({
    total: totalIncidents,
    last7Days: recentIncidents,
    byStatus,
    bySeverity,
    byService,
    avgAcknowledgeMinutes: avgAckMinutes ? Math.round(avgAckMinutes * 10) / 10 : null,
    avgResolveMinutes: avgResolveMinutes ? Math.round(avgResolveMinutes * 10) / 10 : null,
    period: '30d',
  });
});

export default router;
