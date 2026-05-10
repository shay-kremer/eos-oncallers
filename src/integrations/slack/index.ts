import { getConfig } from '../../utils/config';
import { logger } from '../../utils/logger';
import { IncidentPayload } from '../../types';

export async function sendSlackNotification(
  channel: string,
  message: string,
  incident: IncidentPayload
): Promise<void> {
  const config = getConfig();

  if (!config.SLACK_BOT_TOKEN) {
    logger.info({ channel, message }, '[MOCK] Slack notification (no token configured)');
    return;
  }

  const severityColor = {
    CRITICAL: '#e74c3c',
    ERROR: '#e67e22',
    WARNING: '#f1c40f',
    INFO: '#3498db',
  }[incident.severity] || '#95a5a6';

  const payload = {
    channel,
    attachments: [{
      color: severityColor,
      title: `🚨 ${incident.title}`,
      text: message,
      fields: [
        { title: 'Service', value: incident.service.name, short: true },
        { title: 'Severity', value: incident.severity, short: true },
        { title: 'Incident ID', value: incident.id.slice(0, 8), short: true },
      ],
      actions: [
        { type: 'button', text: 'Acknowledge', value: `ack:${incident.id}` },
        { type: 'button', text: 'Resolve', value: `resolve:${incident.id}` },
      ],
    }],
  };

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.status}`);
  }

  const data = await response.json() as { ok: boolean; error?: string };
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  logger.info({ channel, incidentId: incident.id }, 'Slack notification sent');
}
