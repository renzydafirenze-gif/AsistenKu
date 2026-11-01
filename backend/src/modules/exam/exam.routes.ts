import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { validate } from '../../middleware/validate';
import { AUTHORING_ROLES } from '../../domain/enums';
import {
  createExam,
  deleteExam,
  getExam,
  listExams,
  publishExam,
  updateExam,
} from './exam.service';
import {
  createExamSchema,
  examIdParamsSchema,
  listExamQuerySchema,
  publishExamSchema,
  updateExamSchema,
} from './exam.schemas';

export function createExamRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    '/',
    validate({ query: listExamQuerySchema }),
    asyncHandler(async (req, res) => {
      res.json(await listExams(req.user!, req.query as never));
    }),
  );

  router.post(
    '/',
    requireRole(...AUTHORING_ROLES),
    validate({ body: createExamSchema }),
    asyncHandler(async (req, res) => {
      res.status(201).json({ exam: await createExam(req.user!, req.body) });
    }),
  );

  router.get(
    '/:id',
    validate({ params: examIdParamsSchema }),
    asyncHandler(async (req, res) => {
      res.json({ exam: await getExam(req.user!, req.params.id) });
    }),
  );

  router.patch(
    '/:id',
    requireRole(...AUTHORING_ROLES),
    validate({ params: examIdParamsSchema, body: updateExamSchema }),
    asyncHandler(async (req, res) => {
      res.json({ exam: await updateExam(req.user!, req.params.id, req.body) });
    }),
  );

  router.delete(
    '/:id',
    requireRole(...AUTHORING_ROLES),
    validate({ params: examIdParamsSchema }),
    asyncHandler(async (req, res) => {
      await deleteExam(req.user!, req.params.id);
      res.status(204).send();
    }),
  );

  router.post(
    '/:id/publish',
    requireRole(...AUTHORING_ROLES),
    validate({ params: examIdParamsSchema, body: publishExamSchema }),
    asyncHandler(async (req, res) => {
      res.json({ exam: await publishExam(req.user!, req.params.id) });
    }),
  );

  return router;
}