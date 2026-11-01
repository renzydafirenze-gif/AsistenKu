import http from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { disconnectPrisma } from './db/prisma';

const app = createApp();
const server = http.createServer(app);

// Node default header limits are generous; 16KB is plenty for a mobile client and
// caps slowloris-style header flooding.
server.headersTimeout = 20_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 100;

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'asistensiswa api listening');
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'graceful shutdown started');

  server.close(async (error) => {
    if (error) logger.error({ err: error }, 'server close failed');
    await disconnectPrisma();
    process.exit(error ? 1 : 0);
  });

  // Hard stop if in-flight requests never drain.
  setTimeout(() => {
    logger.error('graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => void shutdown(signal));
}

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled rejection');
});

export { app, server };