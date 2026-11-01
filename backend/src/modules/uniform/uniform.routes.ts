import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { validate } from '../../middleware/validate';
import { STAFF_ROLES } from '../../domain/enums';
import { prisma } from '../../db/prisma';
import { todayKey } from '../../lib/dates';
import { BadRequestError } from '../../lib/errors';
import {
  calendarRangeQuerySchema,
  createUniformItemSchema,
  toggleUniformSchema,
  uniformDateQuerySchema,
  upsertCalendarSchema,
} from './uniform.schemas';
import { getChecklist, listCalendar, permittedItemsForDate, toggleItem, upsertCalendarDay } from './uniform.service';

export function createUniformRouter(): Router {
  const router = Router();
  router.use(authenticate);

  /** Catalog of uniform items the school defines. */
  router.get(
    '/items',
    asyncHandler(async (_req, res) => {
      const items = await prisma.uniformItem.findMany({
        where: { isActive: true },
        orderBy: [{ category: 'asc' }, { label: 'asc' }],
        select: { id: true, key: true, label: true, category: true, isDefault: true },
      });
      res.json({ items });
    }),
  );

  router.post(
    '/items',
    requireRole(...STAFF_ROLES),
    validate({ body: createUniformItemSchema }),
    asyncHandler(async (req, res) => {
      const item = await prisma.uniformItem.create({ data: req.body });
      res.status(201).json({ item });
    }),
  );

  /** Which items the academic calendar permits on a date. */
  router.get(
    '/permitted',
    validate({ query: uniformDateQuerySchema }),
    asyncHandler(async (req, res) => {
      const date = (req.query as { date?: string }).date ?? todayKey();
      res.json({ date, ...(await permittedItemsForDate(date)) });
    }),
  );

  router.get(
    '/calendar',
    validate({ query: calendarRangeQuerySchema }),
    asyncHandler(async (req, res) => {
      const { from, to } = req.query as { from: string; to: string };
      res.json({ items: await listCalendar(from, to) });
    }),
  );

  router.put(
    '/calendar',
    requireRole(...STAFF_ROLES),
    validate({ body: upsertCalendarSchema }),
    asyncHandler(async (req, res) => {
      const day = await upsertCalendarDay(req.user!, req.body);
      res.json({ day });
    }),
  );

  /** Daily checklist for the signed-in student (or a student the caller may view). */
  router.get(
    '/checklist',
    validate({ query: uniformDateQuerySchema }),
    asyncHandler(async (req, res) => {
      const query = req.query as { date?: string; studentId?: string };
      const studentId = query.studentId ?? req.user!.id;
      if (req.user!.role !== 'STUDENT' && !query.studentId) {
        throw new BadRequestError('studentId wajib diisi untuk peran non-siswa');
      }
      res.json({ checklist: await getChecklist(req.user!, studentId, query.date ?? todayKey()) });
    }),
  );

  /** Toggle one item. Auto-saved locally and synced; the server re-validates. */
  router.patch(
    '/checklist',
    validate({ body: toggleUniformSchema }),
    asyncHandler(async (req, res) => {
      res.json({ checklist: await toggleItem(req.user!, req.body) });
    }),
  );

  return router;
}