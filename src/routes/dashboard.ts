import { Router, Request, Response } from 'express';
import { getDb } from '../utils/database';

const router = Router();

router.get('/summary', async (_req: Request, res: Response) => {
  const db = getDb();

  const [
    serviceCount,
    userCount,
    teamCount,
    scheduleCount,
    escalationPolicyCount,
    incidentCounts,
    integrationCount,
    recentIncidents,
  ] = await Promise.all([
    db.service.count(),
    db.user.count(),
    db.team.count(),
    db.schedule.count(),
    db.escalationPolicy.count(),
    db.incident.groupBy({ by: ['status'], _count: true }),
    db.serviceIntegration.count(),
    db.incident.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { service: { select: { id: true, name: true } } },
    }),
  ]);

  const incidents = {
    triggered: 0,
    acknowledged: 0,
    resolved: 0,
    total: 0,
  };
  for (const group of incidentCounts) {
    const count = group._count;
    incidents.total += count;
    if (group.status === 'TRIGGERED') incidents.triggered = count;
    else if (group.status === 'ACKNOWLEDGED') incidents.acknowledged = count;
    else if (group.status === 'RESOLVED') incidents.resolved = count;
  }

  // Only expose integration key in development
  let demoIntegrationKey: string | null = null;
  if (process.env.NODE_ENV === 'development') {
    const integration = await db.serviceIntegration.findFirst({
      where: { enabled: true },
      select: { integrationKey: true, name: true, service: { select: { name: true } } },
    });
    if (integration) {
      demoIntegrationKey = integration.integrationKey;
    }
  }

  res.json({
    services: serviceCount,
    users: userCount,
    teams: teamCount,
    schedules: scheduleCount,
    escalationPolicies: escalationPolicyCount,
    integrations: integrationCount,
    incidents,
    recentIncidents,
    demoIntegrationKey,
    environment: process.env.NODE_ENV || "development",
  });
});

export default router;
