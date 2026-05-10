import { getConfig } from '../../utils/config';
import { logger } from '../../utils/logger';
import { IncidentPayload } from '../../types';

export async function sendWebhookNotification(url: string, incident: IncidentPayload): Promise<void> {
  const payload = {
    event: 'incident.triggered',
    timestamp: new Date().toISOString(),
    incident: {
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      urgency: incident.urgency,
      service: incident.service.name,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Webhook delivery failed: ${response.status} to ${url}`);
  }

  logger.info({ url, incidentId: incident.id }, 'Webhook notification sent');
}

export async function sendAwsWebhook(incident: IncidentPayload): Promise<void> {
  const config = getConfig();

  if (!config.AWS_WEBHOOK_URL) {
    logger.info({ incidentId: incident.id }, '[MOCK] AWS webhook (no URL configured)');
    return;
  }

  await sendWebhookNotification(config.AWS_WEBHOOK_URL, incident);
}
