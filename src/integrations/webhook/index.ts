import { logger } from '../../utils/logger';

interface IncidentPayload {
  id: string;
  title: string;
  severity: string;
  urgency: string;
  service: { name: string };
}

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
