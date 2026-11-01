import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { validate } from '../../middleware/validate';
import { pullChanges, pushChanges, syncStatus } from './sync.service';
import { pullSyncSchema, pushSyncSchema } from './sync.schemas';

export function createSyncRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.post(
    '/push',
    validate({ body: pushSyncSchema }),
    asyncHandler(async (req, res) => {
      res.json(await pushChanges(req.user!, req.body));
    }),
  );

  router.get(
    '/pull',
    validate({ query: pullSyncSchema }),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as { since?: string; limit: number };
      res.json(await pullChanges(req.user!, query.since, query.limit));
    }),
  );

  router.get(
    '/status',
    asyncHandler(async (req, res) => {
      res.json(await syncStatus(req.user!));
    }),
  );

  return router;
}