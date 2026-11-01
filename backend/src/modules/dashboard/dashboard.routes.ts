import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { validate } from '../../middleware/validate';
import { z } from 'zod';
import { dateKeySchema } from '../duty/duty.schemas';
import { buildDashboard } from './dashboard.service';
import type { Clock } from '../notifications/types';

export function createDashboardRouter(clock: Clock): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    '/',
    validate({ query: z.object({ date: dateKeySchema.optional() }) }),
    asyncHandler(async (req, res) => {
      const { date } = req.query as { date?: string };
      res.json(await buildDashboard(req.user!, date, clock.now()));
    }),
  );

  return router;
}