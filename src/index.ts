import { createApp } from './app';
import { getConfig } from './utils/config';
import { logger } from './utils/logger';
import { disconnectDb } from './utils/database';

const config = getConfig();
const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'eos-oncallers server started');
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(
      { port: config.PORT },
      `Port ${config.PORT} is already in use. Another instance may be running.\n` +
      `  Find it: lsof -i :${config.PORT}\n` +
      `  Kill it: kill $(lsof -t -i :${config.PORT})`
    );
    process.exit(1);
  }
  throw err;
});

async function shutdown() {
  logger.info('Shutting down...');
  server.close();
  await disconnectDb();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
