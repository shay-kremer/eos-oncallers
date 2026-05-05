import pino from 'pino';
import { getConfig } from './config';

export const logger = pino({
  level: getConfig().LOG_LEVEL,
  transport: getConfig().NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});
