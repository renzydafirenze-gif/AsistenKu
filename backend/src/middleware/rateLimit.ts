import { rateLimit, ipKeyGenerator, type Options } from 'express-rate-limit';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

/**
 * Bucket key for a request.
 *
 * Authenticated traffic is bucketed per account so one student on a shared
 * school NAT cannot exhaust the quota for everyone. The JWT subject is read
 * without verification: forging it only lets an attacker throttle *their own*
 * bucket, never someone else's.
 */
function bucketKey(req: Request): string {
  if (req.user) return `user:${req.user.id}`;

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const decoded = jwt.decode(header.slice(7));
    const subject = typeof decoded === 'object' && decoded ? (decoded as { sub?: unknown }).sub : undefined;
    if (typeof subject === 'string' && subject.length > 0) return `user:${subject}`;
  }
  return `ip:${ipKeyGenerator(req.ip ?? '0.0.0.0')}`;
}

/**
 * Rate limiting: 100 requests/minute per authenticated user (falling back to IP
 * for anonymous traffic). `express-rate-limit` uses the standard
 * RateLimit-* response headers so clients can back off.
 *
 * In-process memory store is intentional for a single-pod baseline; swap in a
 * Redis store when the API scales horizontally (see README "Scaling").
 */
export function createRateLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: bucketKey,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Terlalu banyak permintaan, coba lagi nanti',
          requestId: req.id,
        },
      });
    },
    ...overrides,
  });
}

/** Stricter bucket for credential endpoints to blunt brute-force attacks. */
export function createAuthRateLimiter(overrides: Partial<Options> = {}) {
  return createRateLimiter({ limit: 10, ...overrides });
}

export const standardRateLimiter = createRateLimiter();
