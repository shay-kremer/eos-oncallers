import { getConfig } from '../../utils/config';
import { logger } from '../../utils/logger';

export async function sendSmsNotification(to: string, message: string): Promise<void> {
  const config = getConfig();

  if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN) {
    logger.info({ to, message }, '[MOCK] SMS notification (Twilio not configured)');
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString('base64');

  const body = new URLSearchParams({
    To: to,
    From: config.TWILIO_FROM_NUMBER || '',
    Body: message.slice(0, 1600),
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Twilio SMS error: ${response.status}`);
  }

  logger.info({ to }, 'SMS notification sent');
}

export async function sendPhoneNotification(to: string, message: string): Promise<void> {
  const config = getConfig();

  if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN) {
    logger.info({ to, message }, '[MOCK] Phone call notification (Twilio not configured)');
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.TWILIO_ACCOUNT_SID}/Calls.json`;
  const auth = Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString('base64');

  const twiml = `<Response><Say>${message}</Say><Pause length="2"/><Say>Press 1 to acknowledge. Press 2 to escalate.</Say></Response>`;
  const body = new URLSearchParams({
    To: to,
    From: config.TWILIO_FROM_NUMBER || '',
    Twiml: twiml,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Twilio call error: ${response.status}`);
  }

  logger.info({ to }, 'Phone call notification initiated');
}
