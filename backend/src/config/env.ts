import 'dotenv/config';
import { z } from 'zod';

/**
 * Fail-fast environment configuration.
 * Secrets are validated for length/entropy so a misconfigured deployment cannot
 * boot with a placeholder JWT secret.
 */
const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

/**
 * Blank env vars mean "not configured". `.env.example` ships them empty, so a
 * bare `KEY=` must not fail `.min()` validation.
 */
const optionalSecret = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().min(16).optional(),
);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  /**
   * `sqlite` exists so the app can be demoed without PostgreSQL; it reuses the
   * generated SQLite client from the test pipeline. Production stays `postgres`.
   */
  DATABASE_PROVIDER: z.enum(['postgres', 'sqlite']).default('postgres'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TEST_DATABASE_URL: z.string().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().default('asistensiswa'),
  JWT_AUDIENCE: z.string().default('asistensiswa-app'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

  FIELD_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'FIELD_ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),

  CORS_ORIGINS: z.string().default('http://localhost:8081'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),

  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_IDS: z.string().optional(),

  /** Required to self-register as TEACHER or CLASS_GUARDIAN. */
  STAFF_INVITE_CODE: optionalSecret,
  /** Shared secret for the internal notification scheduler endpoint. */
  INTERNAL_JOB_SECRET: optionalSecret,
  NOTIFICATION_SCHEDULER_ENABLED: booleanish.default(false),

  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  FCM_PRIVATE_KEY: z.string().optional(),
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_PRIVATE_KEY: z.string().optional(),
  APNS_BUNDLE_ID: z.string().optional(),
  APNS_USE_SANDBOX: booleanish.default(true),
  PUSH_DRY_RUN: booleanish.default(true),

  TIMEZONE: z.string().default('Asia/Jakarta'),
  NOTIFICATION_LEAD_HOURS: z.coerce.number().int().min(1).max(72).default(24),
  TRUST_PROXY: booleanish.default(false),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}

export const env: Env = load();
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
