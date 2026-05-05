import { createApp } from './app';
import { getConfig } from './utils/config';
import { logger } from './utils/logger';
import { disconnectDb } from './utils/database';

const config = getConfig();
const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'eos-oncallers server started');
});

async function shutdown() {
  logger.info('Shutting down...');
  server.close();
  await disconnectDb();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
