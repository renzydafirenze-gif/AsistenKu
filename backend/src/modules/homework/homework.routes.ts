import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { validate } from '../../middleware/validate';
import { AUTHORING_ROLES } from '../../domain/enums';
import {
  createHomework,
  deleteHomework,
  getHomework,
  gradeHomework,
  listHomework,
  listSubmissions,
  submitHomework,
  updateHomework,
} from './homework.service';
import {
  createHomeworkSchema,
  gradeHomeworkSchema,
  homeworkIdParamsSchema,
  listHomeworkQuerySchema,
  submitHomeworkSchema,
  updateHomeworkSchema,
} from './homework.schemas';

export function createHomeworkRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    '/',
    validate({ query: listHomeworkQuerySchema }),
    asyncHandler(async (req, res) => {
      res.json(await listHomework(req.user!, req.query as never));
    }),
  );

  router.post(
    '/',
    validate({ body: createHomeworkSchema }),
    asyncHandler(async (req, res) => {
      res.status(201).json({ homework: await createHomework(req.user!, req.body) });
    }),
  );

  router.get(
    '/:id',
    validate({ params: homeworkIdParamsSchema }),
    asyncHandler(async (req, res) => {
      res.json({ homework: await getHomework(req.user!, req.params.id) });
    }),
  );

  router.patch(
    '/:id',
    validate({ params: homeworkIdParamsSchema, body: updateHomeworkSchema }),
    asyncHandler(async (req, res) => {
      res.json({ homework: await updateHomework(req.user!, req.params.id, req.body) });
    }),
  );

  router.delete(
    '/:id',
    validate({ params: homeworkIdParamsSchema }),
    asyncHandler(async (req, res) => {
      await deleteHomework(req.user!, req.params.id);
      res.status(204).send();
    }),
  );

  router.get(
    '/:id/submissions',
    validate({ params: homeworkIdParamsSchema }),
    asyncHandler(async (req, res) => {
      res.json({ items: await listSubmissions(req.user!, req.params.id) });
    }),
  );

  router.post(
    '/:id/submit',
    validate({ params: homeworkIdParamsSchema, body: submitHomeworkSchema }),
    asyncHandler(async (req, res) => {
      res.json({ homework: await submitHomework(req.user!, req.params.id) });
    }),
  );

  router.post(
    '/:id/grade',
    requireRole(...AUTHORING_ROLES),
    validate({ params: homeworkIdParamsSchema, body: gradeHomeworkSchema }),
    asyncHandler(async (req, res) => {
      res.json({ submission: await gradeHomework(req.user!, req.params.id, req.body) });
    }),
  );

  return router;
}