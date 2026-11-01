import path from 'node:path';

/**
 * Jest setup. Runs *before* any module is imported so `src/config/env.ts` sees a
 * complete, deterministic configuration.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://asisten:asisten@localhost:5432/asistensiswa_test';
// Absolute path: the generated SQLite client resolves relative URLs against the
// schema directory, which differs between ts-jest and a compiled build.
process.env.TEST_DATABASE_URL = `file:${path.resolve(__dirname, '..', 'prisma', 'test.db')}`;
process.env.JWT_SECRET = 'test-only-jwt-secret-value-0123456789abcdef';
process.env.JWT_ISSUER = 'asistensiswa-test';
process.env.JWT_AUDIENCE = 'asistensiswa-test-app';
process.env.ACCESS_TOKEN_TTL = '15m';
process.env.REFRESH_TOKEN_TTL_DAYS = '30';
process.env.FIELD_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.BCRYPT_ROUNDS = '4';
process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.CORS_ORIGINS = '*';
process.env.PUSH_DRY_RUN = 'true';
process.env.STAFF_INVITE_CODE = 'test-staff-invite-code-value';
process.env.INTERNAL_JOB_SECRET = 'test-internal-job-secret-value';
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.TIMEZONE = 'Asia/Jakarta';
process.env.NOTIFICATION_LEAD_HOURS = '24';
process.env.TRUST_PROXY = 'false';
