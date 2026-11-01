import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { safeEqual } from '../../lib/fieldCrypto';
import { env } from '../../config/env';
import { ForbiddenError } from '../../lib/errors';
import type { NotificationService } from './notification.service';

/**
 * Notification routes.
 *
 * The scheduler endpoint is authenticated with a shared secret instead of a JWT:
 * it is called by the platform cron/EventBridge rule, not by a person. It is
 * disabled unless INTERNAL_JOB_SECRET is configured.
 */
export function createNotificationRouter(service: NotificationService): Router {
  const router = Router();

  router.post(
    '/run-duty-reminders',
    asyncHandler(async (req, res) => {
      const secret = env.INTERNAL_JOB_SECRET;
      const provided = req.headers['x-job-secret'];
      if (!secret) throw new ForbiddenError('Penjadwal notifikasi tidak diaktifkan');
      if (typeof provided !== 'string' || !safeEqual(provided, secret)) {
        throw new ForbiddenError('Secret penjadwal tidak valid');
      }
      res.json(await service.runDutyReminders());
    }),
  );

  router.use(authenticate);

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json({ items: await service.listForUser(req.user!.id) });
    }),
  );

  return router;
}
