import pino from 'pino';
import { env, isTest } from '../config/env';

/**
 * Structured logger. Redacts anything that could carry credentials or personal
 * data so logs stay safe to ship to a shared log store (OWASP A09).
 */
export const logger = pino({
  level: isTest ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: { service: 'asistensiswa-api', env: env.NODE_ENV },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.newPassword',
      'req.body.refreshToken',
      'req.body.token',
      'req.body.idToken',
      'req.body.phone',
      'req.body.address',
      'passwordHash',
      'phoneEnc',
      'addressEnc',
      '*.passwordHash',
    ],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;
