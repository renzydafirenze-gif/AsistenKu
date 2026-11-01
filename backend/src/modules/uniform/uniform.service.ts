import type { DayType } from '../../domain/enums';
import { prisma } from '../../db/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { parseDateKey, toDateKey } from '../../lib/dates';
import type { AuthUser } from '../../types/express';
import { assertCanViewStudent } from '../users/access';

export interface UniformItemDto {
  key: string;
  label: string;
  category: string;
  checked: boolean;
  checkedAt: string | null;
}

export interface UniformChecklistDto {
  date: string;
  dayType: DayType;
  note: string | null;
  items: UniformItemDto[];
  completedCount: number;
  total: number;
  status: 'COMPLETE' | 'PARTIAL' | 'PENDING' | 'HOLIDAY';
  badge: { label: string; color: string };
  updatedAt: string | null;
}

export const UNIFORM_BADGE_COLORS = {
  COMPLETE: '#27AE60',
  PARTIAL: '#F39C12',
  PENDING: '#2E86C1',
  HOLIDAY: '#7F8C8D',
} as const;

interface CalendarRule {
  dayType: DayType;
  keys: string[];
  note: string | null;
}

/**
 * Resolves which uniform items are permitted on a given day.
 *
 * * The academic calendar is authoritative: a HOLIDAY permits nothing, and a
 *   calendar row limits the checklist to the listed item keys.
 * * Days without an explicit calendar row fall back to the default item set, so
 *   a missing row cannot block the whole school.
 */
export async function permittedItemsForDate(dateKey: string): Promise<CalendarRule> {
  const date = parseDateKey(dateKey);
  const calendar = await prisma.academicCalendar.findUnique({ where: { date } });

  if (calendar) {
    const keys = calendar.uniformItems
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return { dayType: calendar.dayType as DayType, keys, note: calendar.note };
  }

  const defaults = await prisma.uniformItem.findMany({
    where: { isDefault: true, isActive: true },
    orderBy: { label: 'asc' },
    select: { key: true },
  });
  return { dayType: 'SCHOOL_DAY', keys: defaults.map((d) => d.key), note: null };
}

function badgeFor(status: UniformChecklistDto['status']): { label: string; color: string } {
  const labels: Record<UniformChecklistDto['status'], string> = {
    COMPLETE: 'Lengkap',
    PARTIAL: 'Sebagian',
    PENDING: 'Belum dimulai',
    HOLIDAY: 'Libur',
  };
  return { label: labels[status], color: UNIFORM_BADGE_COLORS[status] };
}

/**
 * Returns the checklist for a student and date, materialising rows on first read
 * and reconciling them with the calendar (items no longer permitted are removed,
 * new ones are added unchecked). Only permitted items are ever returned.
 */
export async function getChecklist(
  actor: AuthUser,
  studentId: string,
  dateKey: string,
): Promise<UniformChecklistDto> {
  await assertCanViewStudent(actor, studentId);
  const date = parseDateKey(dateKey);
  const student = await prisma.user.findFirst({ where: { id: studentId, deletedAt: null, role: 'STUDENT' } });
  if (!student) throw new NotFoundError('Siswa tidak ditemukan');

  const rule = await permittedItemsForDate(dateKey);
  const catalog = await prisma.uniformItem.findMany({
    where: { key: { in: rule.keys }, isActive: true },
    orderBy: { label: 'asc' },
  });
  const permitted = catalog.filter((item) => rule.keys.includes(item.key));

  if (rule.dayType === 'HOLIDAY') {
    return {
      date: dateKey,
      dayType: 'HOLIDAY',
      note: rule.note,
      items: [],
      completedCount: 0,
      total: 0,
      status: 'HOLIDAY',
      badge: badgeFor('HOLIDAY'),
      updatedAt: null,
    };
  }

  let checklist = await prisma.uniformChecklist.findUnique({
    where: { studentId_date: { studentId, date } },
    include: { items: true },
  });

  if (!checklist) {
    checklist = await prisma.uniformChecklist.create({
      data: {
        studentId,
        date,
        items: {
          create: permitted.map((item) => ({ itemKey: item.key, label: item.label })),
        },
      },
      include: { items: true },
    });
  } else {
    const existingKeys = new Set(checklist.items.map((i) => i.itemKey));
    const allowedKeys = new Set(permitted.map((i) => i.key));
    const missing = permitted.filter((item) => !existingKeys.has(item.key));
    const stale = checklist.items.filter((item) => !allowedKeys.has(item.itemKey));

    if (missing.length > 0 || stale.length > 0) {
      await prisma.$transaction([
        ...(stale.length > 0
          ? [prisma.uniformChecklistItem.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } })]
          : []),
        ...(missing.length > 0
          ? [
              prisma.uniformChecklistItem.createMany({
                data: missing.map((item) => ({ checklistId: checklist!.id, itemKey: item.key, label: item.label })),
              }),
            ]
          : []),
      ]);
      checklist = await prisma.uniformChecklist.findUniqueOrThrow({
        where: { id: checklist.id },
        include: { items: true },
      });
    }
  }

  const byKey = new Map(checklist.items.map((item) => [item.itemKey, item]));
  const items: UniformItemDto[] = permitted.map((catalogItem) => {
    const stored = byKey.get(catalogItem.key);
    return {
      key: catalogItem.key,
      label: catalogItem.label,
      category: catalogItem.category,
      checked: stored?.checked ?? false,
      checkedAt: stored?.checkedAt?.toISOString() ?? null,
    };
  });

  const completedCount = items.filter((i) => i.checked).length;
  const total = items.length;
  const status: UniformChecklistDto['status'] =
    total === 0 ? 'COMPLETE' : completedCount === total ? 'COMPLETE' : completedCount === 0 ? 'PENDING' : 'PARTIAL';

  return {
    date: dateKey,
    dayType: rule.dayType,
    note: rule.note,
    items,
    completedCount,
    total,
    status,
    badge: badgeFor(status),
    updatedAt: checklist.updatedAt.toISOString(),
  };
}

/**
 * Toggles one checklist item.
 *
 * The item must be permitted by the academic calendar for that date; anything
 * else is rejected with 409 so a stale offline client cannot inject arbitrary
 * uniform rows.
 */
export async function toggleItem(
  actor: AuthUser,
  input: { date: string; itemKey: string; checked: boolean },
): Promise<UniformChecklistDto> {
  if (actor.role !== 'STUDENT') {
    // Only the student ticks their own checklist; staff/parents have read access.
    throw new ForbiddenError('Hanya siswa yang dapat mengubah checklist seragamnya');
  }

  const rule = await permittedItemsForDate(input.date);
  if (rule.dayType === 'HOLIDAY') {
    throw new ConflictError('Tidak ada checklist seragam pada hari libur');
  }
  if (!rule.keys.includes(input.itemKey)) {
    throw new ConflictError(`Item "${input.itemKey}" tidak diizinkan oleh kalender akademik pada tanggal ini`);
  }

  const date = parseDateKey(input.date);
  const checklist = await prisma.uniformChecklist.upsert({
    where: { studentId_date: { studentId: actor.id, date } },
    create: { studentId: actor.id, date },
    update: {},
  });

  const catalogItem = await prisma.uniformItem.findUnique({ where: { key: input.itemKey } });
  if (!catalogItem) throw new NotFoundError('Item seragam tidak ditemukan');

  await prisma.uniformChecklistItem.upsert({
    where: { checklistId_itemKey: { checklistId: checklist.id, itemKey: input.itemKey } },
    create: {
      checklistId: checklist.id,
      itemKey: input.itemKey,
      label: catalogItem.label,
      checked: input.checked,
      checkedAt: input.checked ? new Date() : null,
    },
    update: { checked: input.checked, checkedAt: input.checked ? new Date() : null },
  });

  return getChecklist(actor, actor.id, input.date);
}

export async function listCalendar(fromKey: string, toKey: string) {
  const rows = await prisma.academicCalendar.findMany({
    where: { date: { gte: parseDateKey(fromKey), lte: parseDateKey(toKey) } },
    orderBy: { date: 'asc' },
  });
  return rows.map((row) => ({
    date: toDateKey(row.date),
    dayType: row.dayType as DayType,
    uniformItems: row.uniformItems ? row.uniformItems.split(',').map((s) => s.trim()) : [],
    note: row.note,
  }));
}

export async function upsertCalendarDay(
  actor: AuthUser,
  input: { date: string; dayType: DayType; uniformItems: string[]; note?: string | null },
) {
  if (actor.role !== 'TEACHER' && actor.role !== 'CLASS_GUARDIAN') {
    throw new ForbiddenError('Hanya guru atau wali kelas yang dapat mengubah kalender akademik');
  }
  const date = parseDateKey(input.date);

  if (input.uniformItems.length > 0) {
    const known = await prisma.uniformItem.findMany({
      where: { key: { in: input.uniformItems }, isActive: true },
      select: { key: true },
    });
    const unknown = input.uniformItems.filter((key) => !known.some((k) => k.key === key));
    if (unknown.length > 0) throw new ConflictError('Item seragam tidak dikenal', { unknown });
  }

  return prisma.academicCalendar.upsert({
    where: { date },
    create: {
      date,
      dayType: input.dayType,
      uniformItems: input.uniformItems.join(','),
      note: input.note ?? null,
    },
    update: { dayType: input.dayType, uniformItems: input.uniformItems.join(','), note: input.note ?? null },
  });
}