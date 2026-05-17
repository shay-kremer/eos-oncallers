import { getDb } from '../utils/database';
import { logger } from '../utils/logger';
import { resolveScheduleOncall } from '../utils/schedule';
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
      if (oncall) userIds.push(oncall.userId);
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
  }
}
