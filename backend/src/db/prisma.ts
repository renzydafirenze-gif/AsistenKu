import { PrismaClient } from '@prisma/client';
import { env, isTest } from '../config/env';
import { logger } from '../lib/logger';

/**
 * Prisma client singleton.
 *
 * Production uses the PostgreSQL client generated from prisma/schema.prisma.
 * The test suite uses a SQLite mirror generated into generated/test-client so it
 * can run without Docker. Both are generated from the same model definitions
 * (scripts/gen-test-schema.cjs) and are structurally identical, so the SQLite
 * client is cast to the PostgreSQL client type here and nowhere else.
 */
declare global {
  // eslint-disable-next-line no-var
  var __asistenPrisma: PrismaClient | undefined;
}

function createSqliteClient(url: string): PrismaClient {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { PrismaClient: SqliteClient } = require('../../generated/test-client') as {
    PrismaClient: new (options: unknown) => PrismaClient;
  };
  return new SqliteClient({ datasources: { db: { url } } });
}

function createTestClient(): PrismaClient {
  return createSqliteClient(env.TEST_DATABASE_URL ?? 'file:./test.db');
}

function createClient(): PrismaClient {
  if (isTest) return createTestClient();
  if (env.DATABASE_PROVIDER === 'sqlite') return createSqliteClient(env.DATABASE_URL);

  const client = new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

  client.$on('warn' as never, (event: unknown) => logger.warn({ prisma: event }, 'prisma warning'));
  client.$on('error' as never, (event: unknown) => logger.error({ prisma: event }, 'prisma error'));
  return client;
}

export const prisma: PrismaClient = global.__asistenPrisma ?? createClient();

if (isTest) {
  // Tests share one SQLite file; the global singleton avoids connection storms.
  global.__asistenPrisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  if (isTest) global.__asistenPrisma = undefined;
}
