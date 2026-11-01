import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { validate } from '../../middleware/validate';
import { STAFF_ROLES } from '../../domain/enums';
import {
  completeDuty,
  createDuty,
  deleteDuty,
  getDuty,
  listDuties,
  updateDuty,
} from './duty.service';
import {
  completeDutySchema,
  createDutySchema,
  dutyIdParamsSchema,
  listDutyQuerySchema,
  updateDutySchema,
} from './duty.schemas';

export function createDutyRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    '/',
    validate({ query: listDutyQuerySchema }),
    asyncHandler(async (req, res) => {
      res.json(await listDuties(req.user!, req.query as never));
    }),
  );

  router.post(
    '/',
    requireRole(...STAFF_ROLES),
    validate({ body: createDutySchema }),
    asyncHandler(async (req, res) => {
      res.status(201).json({ duty: await createDuty(req.user!, req.body) });
    }),
  );

  router.get(
    '/:id',
    validate({ params: dutyIdParamsSchema }),
    asyncHandler(async (req, res) => {
      res.json({ duty: await getDuty(req.user!, req.params.id) });
    }),
  );

  router.patch(
    '/:id',
    requireRole(...STAFF_ROLES),
    validate({ params: dutyIdParamsSchema, body: updateDutySchema }),
    asyncHandler(async (req, res) => {
      res.json({ duty: await updateDuty(req.user!, req.params.id, req.body) });
    }),
  );

  router.delete(
    '/:id',
    requireRole(...STAFF_ROLES),
    validate({ params: dutyIdParamsSchema }),
    asyncHandler(async (req, res) => {
      await deleteDuty(req.user!, req.params.id);
      res.status(204).send();
    }),
  );

  /** Mark complete. Returns a toast payload the app shows as confirmation. */
  router.post(
    '/:id/complete',
    validate({ params: dutyIdParamsSchema, body: completeDutySchema }),
    asyncHandler(async (req, res) => {
      const result = await completeDuty(req.user!, req.params.id, req.body.completedAt);
      res.json(result);
    }),
  );

  return router;
}