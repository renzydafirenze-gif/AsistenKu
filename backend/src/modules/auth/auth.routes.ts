import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { validate } from '../../middleware/validate';
import { createAuthRateLimiter } from '../../middleware/rateLimit';
import { auditFromRequest } from '../../lib/audit';
import { writeAudit } from '../../lib/audit';
import { prisma } from '../../db/prisma';
import { NotFoundError } from '../../lib/errors';
import type { AuthService, TokenContext } from './auth.service';
import {
  googleSignInSchema,
  loginSchema,
  pushTokenSchema,
  refreshSchema,
  registerSchema,
} from './auth.schemas';
import { registerPushToken, revokePushToken } from '../notifications/pushToken.service';

function tokenContext(req: { ip?: string; headers: Record<string, unknown> }): TokenContext {
  return {
    ip: req.ip,
    userAgent: typeof req.headers['user-agent'] === 'string' ? (req.headers['user-agent'] as string) : undefined,
  };
}

export interface AuthRouterOptions {
  /** Disabled in unit tests and latency benchmarks; enabled in production. */
  enableRateLimit?: boolean;
}

export function createAuthRouter(authService: AuthService, options: AuthRouterOptions = {}): Router {
  const router = Router();
  // Credential endpoints get a tighter bucket than the global limiter.
  const authLimiter = options.enableRateLimit === false ? [] : [createAuthRateLimiter()];

  router.post(
    '/register',
    ...authLimiter,
    validate({ body: registerSchema }),
    asyncHandler(async (req, res) => {
      const result = await authService.register(req.body, tokenContext(req));
      await writeAudit(auditFromRequest(req, { action: 'auth.register', entityType: 'User', entityId: result.user.id }));
      res.status(201).json(result);
    }),
  );

  router.post(
    '/login',
    ...authLimiter,
    validate({ body: loginSchema }),
    asyncHandler(async (req, res) => {
      const result = await authService.login(req.body, tokenContext(req));
      await writeAudit(auditFromRequest(req, { action: 'auth.login', entityType: 'User', entityId: result.user.id }));
      res.json(result);
    }),
  );

  router.post(
    '/google',
    ...authLimiter,
    validate({ body: googleSignInSchema }),
    asyncHandler(async (req, res) => {
      const result = await authService.signInWithGoogle(req.body, tokenContext(req));
      await writeAudit(
        auditFromRequest(req, { action: 'auth.google', entityType: 'User', entityId: result.user.id }),
      );
      res.json(result);
    }),
  );

  router.post(
    '/refresh',
    ...authLimiter,
    validate({ body: refreshSchema }),
    asyncHandler(async (req, res) => {
      const result = await authService.refresh(req.body.refreshToken, tokenContext(req));
      res.json(result);
    }),
  );

  router.post(
    '/logout',
    validate({ body: refreshSchema }),
    asyncHandler(async (req, res) => {
      await authService.logout(req.body.refreshToken);
      res.status(204).send();
    }),
  );

  router.post(
    '/logout-all',
    authenticate,
    asyncHandler(async (req, res) => {
      const revoked = await authService.logoutAll(req.user!.id);
      await writeAudit(
        auditFromRequest(req, { action: 'auth.logout_all', entityType: 'User', entityId: req.user!.id, metadata: { revoked } }),
      );
      res.json({ revoked });
    }),
  );

  router.get(
    '/me',
    authenticate,
    asyncHandler(async (req, res) => {
      res.json({ user: await authService.me(req.user!.id) });
    }),
  );

  /** Push token registration: deduped per device token (see pushToken.service). */
  router.post(
    '/push-tokens',
    authenticate,
    validate({ body: pushTokenSchema }),
    asyncHandler(async (req, res) => {
      const token = await registerPushToken(req.user!.id, req.body.token, req.body.platform);
      res.status(201).json({ id: token.id, platform: token.platform, registeredAt: token.createdAt.toISOString() });
    }),
  );

  router.delete(
    '/push-tokens',
    authenticate,
    validate({ body: pushTokenSchema }),
    asyncHandler(async (req, res) => {
      const removed = await revokePushToken(req.user!.id, req.body.token);
      if (!removed) throw new NotFoundError('Token perangkat tidak ditemukan');
      res.status(204).send();
    }),
  );

  /** Convenience for clients: list active devices of the current account. */
  router.get(
    '/push-tokens',
    authenticate,
    asyncHandler(async (req, res) => {
      const tokens = await prisma.pushToken.findMany({
        where: { userId: req.user!.id, revokedAt: null },
        select: { id: true, platform: true, createdAt: true, lastSeenAt: true },
      });
      res.json({ items: tokens });
    }),
  );

  router.post(
    '/change-password',
    authenticate,
    ...authLimiter,
    validate({ body: loginSchema.pick({ password: true }).extend({ newPassword: loginSchema.shape.password }) }),
    asyncHandler(async (req, res) => {
      const { password, newPassword } = req.body as { password: string; newPassword: string };
      await authService.changePassword(req.user!.id, password, newPassword);
      await writeAudit(
        auditFromRequest(req, { action: 'auth.change_password', entityType: 'User', entityId: req.user!.id }),
      );
      res.status(204).send();
    }),
  );

  return router;
}
