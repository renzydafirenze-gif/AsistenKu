import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { validate } from '../../middleware/validate';
import { prisma } from '../../db/prisma';
import { ForbiddenError } from '../../lib/errors';
import { z } from 'zod';
import { isStaff } from '../../domain/enums';

const classIdParamsSchema = z.object({ classId: z.string().uuid('ID kelas tidak valid') });

export function createUserRouter(): Router {
  const router = Router();
  router.use(authenticate);

  /** Class roster. Students see only their own class; parents see their child's. */
  router.get(
    '/classmates',
    validate({ query: z.object({ classId: z.string().uuid().optional() }) }),
    asyncHandler(async (req, res) => {
      const requested = (req.query as { classId?: string }).classId;
      const classId = requested ?? req.user!.classId;
      if (!classId) return res.json({ items: [] });

      if (req.user!.role === 'STUDENT' && classId !== req.user!.classId) {
        throw new ForbiddenError('Tidak dapat melihat kelas lain');
      }
      if (req.user!.role === 'PARENT' && requested) {
        const links = await prisma.guardianLink.findMany({
          where: { parentId: req.user!.id },
          select: { studentId: true },
        });
        const wards = await prisma.user.findMany({
          where: { id: { in: links.map((l) => l.studentId) } },
          select: { classId: true },
        });
        if (!wards.some((w) => w.classId === classId)) throw new ForbiddenError('Tidak dapat melihat kelas lain');
      }
      if (isStaff(req.user!.role) && req.user!.classId && classId !== req.user!.classId) {
        throw new ForbiddenError('Tidak dapat melihat kelas lain');
      }

      const items = await prisma.user.findMany({
        where: { classId, deletedAt: null, isActive: true },
        select: { id: true, fullName: true, role: true },
        orderBy: { fullName: 'asc' },
      });
      res.json({ items });
    }),
  );

  /** Ward list for a parent account (empty for other roles). */
  router.get(
    '/wards',
    asyncHandler(async (req, res) => {
      if (req.user!.role !== 'PARENT') return res.json({ items: [] });
      const links = await prisma.guardianLink.findMany({
        where: { parentId: req.user!.id },
        include: { student: { select: { id: true, fullName: true, classId: true } } },
      });
      res.json({ items: links.map((link) => link.student) });
    }),
  );

  router.get(
    '/:classId/roster',
    requireRole('TEACHER', 'CLASS_GUARDIAN'),
    validate({ params: classIdParamsSchema }),
    asyncHandler(async (req, res) => {
      const { classId } = req.params as { classId: string };
      if (req.user!.classId && req.user!.classId !== classId) throw new ForbiddenError('Tidak dapat melihat kelas lain');

      const items = await prisma.user.findMany({
        where: { classId, deletedAt: null },
        select: { id: true, fullName: true, email: true, role: true, isActive: true },
        orderBy: { fullName: 'asc' },
      });
      res.json({ items });
    }),
  );

  return router;
}