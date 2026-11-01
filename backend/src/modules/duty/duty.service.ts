import { prisma } from '../../db/prisma';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../lib/errors';
import { addDays, countdownTo, parseDateKey, toDateKey, todayUtcMidnight } from '../../lib/dates';
import { writeAudit } from '../../lib/audit';
import type { AuthUser } from '../../types/express';
import { assertCanManageClass, logDeniedAttempt } from '../users/access';
import type { CreateDutyInput, ListDutyQuery, UpdateDutyInput } from './duty.schemas';
import type { DutyShift } from '../../domain/enums';

export interface DutyDto {
  id: string;
  classId: string;
  className: string;
  date: string;
  shift: DutyShift;
  assignedStudentId: string;
  assignedStudentName: string;
  notes: string | null;
  completedAt: string | null;
  status: 'COMPLETED' | 'TODAY' | 'UPCOMING' | 'OVERDUE';
  countdown: { days: number; hours: number; label: string; isPast: boolean };
  canComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

function findDutyRecord(id: string) {
  return prisma.dutySchedule.findFirst({
    where: { id, deletedAt: null },
    include: {
      class: { select: { name: true } },
      assignedStudent: { select: { id: true, fullName: true } },
    },
  });
}

const dutyInclude = {
  class: { select: { name: true } },
  assignedStudent: { select: { id: true, fullName: true } },
} as const;

type DutyWithRelations = {
  id: string;
  classId: string;
  date: Date;
  shift: string;
  assignedStudentId: string;
  notes: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  class: { name: string };
  assignedStudent: { id: string; fullName: string };
};

export function toDutyDto(duty: DutyWithRelations, actor: AuthUser, now: Date = new Date()): DutyDto {
  const today = todayUtcMidnight(now);
  const dutyDay = parseDateKey(toDateKey(duty.date));
  const countdown = countdownTo(dutyDay, now);

  let status: DutyDto['status'];
  if (duty.completedAt) status = 'COMPLETED';
  else if (dutyDay.getTime() === today.getTime()) status = 'TODAY';
  else if (dutyDay.getTime() < today.getTime()) status = 'OVERDUE';
  else status = 'UPCOMING';

  const isAssignedStudent = actor.id === duty.assignedStudentId;
  // Staff of the class may complete on a student's behalf (e.g. substitute).
  const isClassStaff =
    (actor.role === 'TEACHER' || actor.role === 'CLASS_GUARDIAN') &&
    (!actor.classId || actor.classId === duty.classId);

  return {
    id: duty.id,
    classId: duty.classId,
    className: duty.class.name,
    date: toDateKey(duty.date),
    shift: duty.shift as DutyShift,
    assignedStudentId: duty.assignedStudentId,
    assignedStudentName: duty.assignedStudent.fullName,
    notes: duty.notes,
    completedAt: duty.completedAt?.toISOString() ?? null,
    status,
    countdown,
    canComplete:
      !duty.completedAt && (isAssignedStudent || isClassStaff) && dutyDay.getTime() <= today.getTime(),
    createdAt: duty.createdAt.toISOString(),
    updatedAt: duty.updatedAt.toISOString(),
  };
}

export async function listDuties(actor: AuthUser, query: ListDutyQuery, now: Date = new Date()) {
  const where: Record<string, unknown> = { deletedAt: null };

  if (actor.role === 'STUDENT') {
    where.assignedStudentId = actor.id;
  } else if (actor.role === 'PARENT') {
    const links = await prisma.guardianLink.findMany({ where: { parentId: actor.id }, select: { studentId: true } });
    where.assignedStudentId = { in: links.map((l) => l.studentId) };
  } else {
    if (!actor.classId) return { items: [], nextCursor: null };
    where.classId = actor.classId;
  }

  if (query.classId) {
    if (actor.role !== 'STUDENT' && actor.role !== 'PARENT' && query.classId !== actor.classId) {
      throw new ForbiddenError('Tidak dapat melihat kelas lain');
    }
    where.classId = query.classId;
  }
  if (query.studentId) {
    if (actor.role === 'STUDENT' && query.studentId !== actor.id) throw new ForbiddenError();
    where.assignedStudentId = query.studentId;
  }
  if (query.completed) where.completedAt = query.completed === 'true' ? { not: null } : null;

  const from = query.from ? parseDateKey(query.from) : addDays(todayUtcMidnight(now), -7);
  const to = query.to ? parseDateKey(query.to) : addDays(todayUtcMidnight(now), 30);
  where.date = { gte: from, lte: to };

  const records = await prisma.dutySchedule.findMany({
    where,
    include: dutyInclude,
    orderBy: [{ date: 'asc' }, { shift: 'asc' }, { id: 'asc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  const hasMore = records.length > query.limit;
  const page = hasMore ? records.slice(0, query.limit) : records;

  return {
    items: page.map((record) => toDutyDto(record as DutyWithRelations, actor, now)),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

export async function getDuty(actor: AuthUser, id: string, now: Date = new Date()): Promise<DutyDto> {
  const duty = await findDutyRecord(id);
  if (!duty) throw new NotFoundError('Jadwal piket tidak ditemukan');

  if (actor.role === 'STUDENT' && duty.assignedStudentId !== actor.id) {
    await logDeniedAttempt(actor, 'duty.read.denied', 'DutySchedule', id);
    throw new ForbiddenError('Kamu hanya dapat melihat piket milikmu');
  }
  if (actor.role === 'PARENT') {
    const link = await prisma.guardianLink.findFirst({
      where: { parentId: actor.id, studentId: duty.assignedStudentId },
    });
    if (!link) {
      await logDeniedAttempt(actor, 'duty.read.denied', 'DutySchedule', id);
      throw new ForbiddenError('Kamu hanya dapat melihat piket anakmu');
    }
  }
  if ((actor.role === 'TEACHER' || actor.role === 'CLASS_GUARDIAN') && actor.classId && duty.classId !== actor.classId) {
    await logDeniedAttempt(actor, 'duty.read.denied', 'DutySchedule', id);
    throw new ForbiddenError('Piket berada di kelas lain');
  }

  return toDutyDto(duty as DutyWithRelations, actor, now);
}

export async function createDuty(actor: AuthUser, input: CreateDutyInput): Promise<DutyDto> {
  await assertCanManageClass(actor, input.classId);

  const student = await prisma.user.findFirst({
    where: { id: input.assignedStudentId, deletedAt: null },
    select: { id: true, role: true, classId: true },
  });
  if (!student || student.role !== 'STUDENT') throw new BadRequestError('Siswa tidak ditemukan');
  if (student.classId !== input.classId) throw new BadRequestError('Siswa bukan anggota kelas tersebut');

  const date = parseDateKey(input.date);
  if (date.getTime() < todayUtcMidnight().getTime()) {
    throw new BadRequestError('Tidak dapat membuat piket pada tanggal yang sudah lewat');
  }

  const clash = await prisma.dutySchedule.findFirst({
    where: { classId: input.classId, date, shift: input.shift, deletedAt: null },
  });
  if (clash) throw new ConflictError('Sudah ada piket untuk kelas, tanggal, dan shift tersebut');

  const duty = await prisma.dutySchedule.create({
    data: {
      classId: input.classId,
      date,
      shift: input.shift,
      assignedStudentId: input.assignedStudentId,
      notes: input.notes ?? null,
      createdById: actor.id,
    },
    include: dutyInclude,
  });

  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'duty.create',
    entityType: 'DutySchedule',
    entityId: duty.id,
    metadata: { date: input.date, shift: input.shift, assignedStudentId: input.assignedStudentId },
  });

  return toDutyDto(duty as DutyWithRelations, actor);
}

export async function updateDuty(actor: AuthUser, id: string, input: UpdateDutyInput): Promise<DutyDto> {
  const duty = await findDutyRecord(id);
  if (!duty) throw new NotFoundError('Jadwal piket tidak ditemukan');
  await assertCanManageClass(actor, duty.classId);

  if (duty.completedAt) throw new ConflictError('Piket yang sudah selesai tidak dapat diubah');

  const data: Record<string, unknown> = {};
  if (input.date) {
    const date = parseDateKey(input.date);
    if (date.getTime() < todayUtcMidnight().getTime()) {
      throw new BadRequestError('Tidak dapat memindahkan piket ke tanggal yang sudah lewat');
    }
    data.date = date;
  }
  if (input.shift) data.shift = input.shift;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.assignedStudentId) {
    const student = await prisma.user.findFirst({
      where: { id: input.assignedStudentId, deletedAt: null },
      select: { role: true, classId: true },
    });
    if (!student || student.role !== 'STUDENT') throw new BadRequestError('Siswa tidak ditemukan');
    if (student.classId !== duty.classId) throw new BadRequestError('Siswa bukan anggota kelas tersebut');
    data.assignedStudentId = input.assignedStudentId;
  }

  const updated = await prisma.dutySchedule.update({
    where: { id },
    data,
    include: dutyInclude,
  });

  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'duty.update',
    entityType: 'DutySchedule',
    entityId: id,
    metadata: { changes: Object.keys(data) },
  });

  return toDutyDto(updated as DutyWithRelations, actor);
}

export async function deleteDuty(actor: AuthUser, id: string): Promise<void> {
  const duty = await findDutyRecord(id);
  if (!duty) throw new NotFoundError('Jadwal piket tidak ditemukan');
  await assertCanManageClass(actor, duty.classId);

  await prisma.dutySchedule.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'duty.delete',
    entityType: 'DutySchedule',
    entityId: id,
  });
}

export interface CompleteDutyResult {
  duty: DutyDto;
  toast: { type: 'success' | 'info'; message: string };
}

/**
 * Marks a duty completed. Idempotent: repeating the call returns the same state
 * with an informational toast instead of erroring (mobile clients retry).
 */
export async function completeDuty(
  actor: AuthUser,
  id: string,
  completedAt?: string,
  now: Date = new Date(),
): Promise<CompleteDutyResult> {
  const duty = await findDutyRecord(id);
  if (!duty) throw new NotFoundError('Jadwal piket tidak ditemukan');

  const isAssigned = actor.id === duty.assignedStudentId;
  const isClassStaff =
    (actor.role === 'TEACHER' || actor.role === 'CLASS_GUARDIAN') &&
    (!actor.classId || actor.classId === duty.classId);

  if (!isAssigned && !isClassStaff) {
    await logDeniedAttempt(actor, 'duty.complete.denied', 'DutySchedule', id);
    throw new ForbiddenError('Hanya siswa yang bertugas yang dapat menandai piket selesai');
  }

  if (duty.completedAt) {
    return {
      duty: toDutyDto(duty as DutyWithRelations, actor, now),
      toast: { type: 'info', message: 'Piket ini sudah ditandai selesai' },
    };
  }

  const dutyDay = parseDateKey(toDateKey(duty.date));
  if (dutyDay.getTime() > todayUtcMidnight(now).getTime()) {
    throw new ConflictError('Piket belum dapat diselesaikan sebelum harinya tiba');
  }

  const updated = await prisma.dutySchedule.update({
    where: { id },
    data: { completedAt: completedAt ? new Date(completedAt) : now, completedById: actor.id },
    include: dutyInclude,
  });

  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'duty.complete',
    entityType: 'DutySchedule',
    entityId: id,
    metadata: { completedAt: updated.completedAt?.toISOString() },
  });

  return {
    duty: toDutyDto(updated as DutyWithRelations, actor, now),
    toast: { type: 'success', message: 'Piket ditandai selesai. Terima kasih!' },
  };
}