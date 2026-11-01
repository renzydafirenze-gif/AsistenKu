import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { validate } from '../../middleware/validate';
import { AUTHORING_ROLES } from '../../domain/enums';
import { createSubject, deleteSubject, listSubjects, updateSubject } from './subject.service';
import { createSubjectSchema, subjectIdParamsSchema, updateSubjectSchema } from './subject.schemas';

export function createSubjectRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json(await listSubjects(req.user!));
    }),
  );

  router.post(
    '/',
    requireRole(...AUTHORING_ROLES),
    validate({ body: createSubjectSchema }),
    asyncHandler(async (req, res) => {
      res.status(201).json({ subject: await createSubject(req.user!, req.body) });
    }),
  );

  router.patch(
    '/:id',
    requireRole(...AUTHORING_ROLES),
    validate({ params: subjectIdParamsSchema, body: updateSubjectSchema }),
    asyncHandler(async (req, res) => {
      res.json({ subject: await updateSubject(req.user!, req.params.id, req.body) });
    }),
  );

  router.delete(
    '/:id',
    requireRole(...AUTHORING_ROLES),
    validate({ params: subjectIdParamsSchema }),
    asyncHandler(async (req, res) => {
      await deleteSubject(req.user!, req.params.id);
      res.status(204).send();
    }),
  );

  return router;
}