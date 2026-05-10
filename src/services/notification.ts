import { getDb } from '../utils/database';
import { logger } from '../utils/logger';
import { sendSlackNotification } from '../integrations/slack';
import { sendSmsNotification, sendPhoneNotification } from '../integrations/twilio';
import { sendWebhookNotification } from '../integrations/webhook';
import { IncidentPayload } from '../types';

export async function notifyIncident(incidentId: string): Promise<void> {
  const db = getDb();

  const incident = await db.incident.findUnique({
    where: { id: incidentId },
    include: {
      service: {
        include: {
          escalationPolicy: {
            include: { levels: { include: { targets: true }, orderBy: { level: 'asc' } } },
          },
        },
      },
    },
  });

  if (!incident) {
    logger.error({ incidentId }, 'Incident not found for notification');
    return;
  }

  const policy = incident.service.escalationPolicy;
  if (!policy || policy.levels.length === 0) {
    logger.warn({ incidentId, serviceId: incident.serviceId }, 'No escalation policy configured');
    return;
  }

  const firstLevel = policy.levels[0];
  const userIds: string[] = [];

  for (const target of firstLevel.targets) {
    if (target.targetType === 'USER') {
      userIds.push(target.targetId);
    } else if (target.targetType === 'SCHEDULE') {
      const oncall = await resolveScheduleOncall(target.targetId);
      if (oncall) userIds.push(oncall);
    }
  }

  for (const userId of userIds) {
    await db.incidentAssignment.upsert({
      where: { incidentId_userId: { incidentId, userId } },
      create: { incidentId, userId },
      update: {},
    });

    const rules = await db.notificationRule.findMany({
      where: { userId, enabled: true },
    });

    for (const rule of rules) {
      if (rule.urgency && rule.urgency !== incident.urgency) continue;

      try {
        await dispatchNotification(rule.method, rule.contactDetail, incident);
      } catch (err) {
        logger.error({ err, userId, method: rule.method, incidentId }, 'Notification dispatch failed');
      }
    }
  }

  logger.info({ incidentId, notified: userIds.length }, 'Incident notifications sent');
}

async function resolveScheduleOncall(scheduleId: string): Promise<string | null> {
  const db = getDb();
  const now = new Date();

  const override = await db.scheduleOverride.findFirst({
    where: { scheduleId, startTime: { lte: now }, endTime: { gte: now } },
  });
  if (override) return override.userId;

  const schedule = await db.schedule.findUnique({
    where: { id: scheduleId },
    include: { layers: { include: { members: { orderBy: { position: 'asc' } } }, orderBy: { priority: 'desc' } } },
  });

  if (!schedule || schedule.layers.length === 0) return null;
  const topLayer = schedule.layers[0];
  if (topLayer.members.length === 0) return null;

  const daysSinceStart = Math.floor((now.getTime() - topLayer.startDate.getTime()) / (1000 * 60 * 60 * 24));
  const rotationIndex = topLayer.rotationType === 'daily'
    ? daysSinceStart % topLayer.members.length
    : Math.floor(daysSinceStart / 7) % topLayer.members.length;

  return topLayer.members[rotationIndex].userId;
}

async function dispatchNotification(
  method: string,
  contactDetail: string,
  incident: IncidentPayload
): Promise<void> {
  const message = `[${incident.severity}] ${incident.title} - Service: ${incident.service.name} (Incident #${incident.id.slice(0, 8)})`;

  switch (method) {
    case 'SLACK':
      await sendSlackNotification(contactDetail, message, incident);
      break;
    case 'SMS':
      await sendSmsNotification(contactDetail, message);
      break;
    case 'PHONE':
      await sendPhoneNotification(contactDetail, message);
      break;
    case 'WEBHOOK':
      await sendWebhookNotification(contactDetail, incident);
      break;
    case 'EMAIL':
      logger.info({ method, contactDetail }, 'Email notification (not implemented - use webhook)');
      break;
  }
}

export async function escalateIncident(incidentId: string, currentLevel: number): Promise<void> {
  const db = getDb();
  const incident = await db.incident.findUnique({
    where: { id: incidentId },
    include: { service: { include: { escalationPolicy: { include: { levels: { include: { targets: true }, orderBy: { level: 'asc' } } } } } } },
  });

  if (!incident || incident.status !== 'TRIGGERED') return;

  const policy = incident.service.escalationPolicy;
  if (!policy) return;

  const nextLevel = policy.levels.find(l => l.level === currentLevel + 1);
  if (!nextLevel) {
    logger.warn({ incidentId, currentLevel }, 'No more escalation levels');
    return;
  }

  for (const target of nextLevel.targets) {
    const userId = target.targetType === 'USER' ? target.targetId : await resolveScheduleOncall(target.targetId);
    if (!userId) continue;

    await db.incidentAssignment.upsert({
      where: { incidentId_userId: { incidentId, userId } },
      create: { incidentId, userId },
      update: {},
    });

    const rules = await db.notificationRule.findMany({ where: { userId, enabled: true } });
    for (const rule of rules) {
      try {
        await dispatchNotification(rule.method, rule.contactDetail, { ...incident, service: incident.service });
      } catch (err) {
        logger.error({ err, userId, incidentId }, 'Escalation notification failed');
      }
    }
  }

  await db.incidentTimeline.create({
    data: { incidentId, type: 'escalated', message: `Escalated to level ${currentLevel + 1}` },
  });
}
