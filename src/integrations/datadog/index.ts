import { getConfig } from '../../utils/config';
import { logger } from '../../utils/logger';

interface DatadogEvent {
  title: string;
  text: string;
  alert_type: 'info' | 'warning' | 'error';
  tags: string[];
}

export async function sendDatadogEvent(event: DatadogEvent): Promise<void> {
  const config = getConfig();

  if (!config.DATADOG_API_KEY) {
    logger.info({ event }, '[MOCK] Datadog event (no API key configured)');
    return;
  }

  const response = await fetch('https://api.datadoghq.com/api/v1/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': config.DATADOG_API_KEY,
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    throw new Error(`Datadog API error: ${response.status}`);
  }

  logger.info({ title: event.title }, 'Datadog event sent');
}

export async function checkDatadogMonitor(monitorId: string): Promise<unknown> {
  const config = getConfig();

  if (!config.DATADOG_API_KEY || !config.DATADOG_APP_KEY) {
    logger.info({ monitorId }, '[MOCK] Datadog monitor check');
    return { status: 'OK' };
  }

  const response = await fetch(`https://api.datadoghq.com/api/v1/monitor/${monitorId}`, {
    headers: {
      'DD-API-KEY': config.DATADOG_API_KEY,
      'DD-APPLICATION-KEY': config.DATADOG_APP_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Datadog monitor check error: ${response.status}`);
  }

  return response.json();
}
