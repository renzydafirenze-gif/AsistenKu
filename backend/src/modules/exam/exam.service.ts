import type { ExamSchedule, Subject } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { addDays, parseDateKey, toDateKey, todayUtcMidnight } from '../../lib/dates';
import { writeAudit } from '../../lib/audit';
import type { AuthUser } from '../../types/express';
import { isAuthoring } from '../../domain/enums';
import { assertCanManageClass, logDeniedAttempt } from '../users/access';
import type { CreateExamInput, ListExamQuery, UpdateExamInput } from './exam.schemas';

export interface ExamDto {
  id: string;
  classId: string;
  className: string;
  subject: { id: string; name: string; code: string };
  title: string;
  examDate: string;
  startTime: string;
  endTime: string;
  room: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  /** Business rule: published exams are immutable for everyone. */
  isLocked: boolean;
  daysUntil: number;
  createdAt: string;
}

type ExamWithRelations = ExamSchedule & {
  subject: Pick<Subject, 'id' | 'name' | 'code'>;
  class: { name: string };
};

const examInclude = {
  subject: { select: { id: true, name: true, code: true } },
  class: { select: { name: true } },
} as const;

function toDto(exam: ExamWithRelations, now: Date): ExamDto {
  const examDay = parseDateKey(toDateKey(exam.examDate));
  const daysUntil = Math.round((examDay.getTime() - todayUtcMidnight(now).getTime()) / 86_400_000);
  return {
    id: exam.id,
    classId: exam.classId,
    className: exam.class.name,
    subject: exam.subject,
    title: exam.title,
    examDate: toDateKey(exam.examDate),
    startTime: exam.startTime,
    endTime: exam.endTime,
    room: exam.room,
    isPublished: exam.publishedAt !== null,
    publishedAt: exam.publishedAt?.toISOString() ?? null,
    isLocked: exam.publishedAt !== null,
    daysUntil,
    createdAt: exam.createdAt.toISOString(),
  };
}

export async function listExams(actor: AuthUser, query: ListExamQuery, now: Date = new Date()) {
  const where: Record<string, unknown> = { deletedAt: null };

  if (actor.role === 'STUDENT') {
    if (!actor.classId) return { items: [] };
    where.classId = actor.classId;
    // Students only ever see published exams.
    where.publishedAt = { not: null };
  } else if (actor.role === 'PARENT') {
    const links = await prisma.guardianLink.findMany({ where: { parentId: actor.id }, select: { studentId: true } });
    const students = await prisma.user.findMany({
      where: { id: { in: links.map((l) => l.studentId) } },
      select: { classId: true },
    });
    const classIds = students.map((s) => s.classId).filter((id): id is string => Boolean(id));
    if (classIds.length === 0) return { items: [] };
    where.classId = { in: classIds };
    where.publishedAt = { not: null };
  } else {
    if (!actor.classId) return { items: [] };
    where.classId = actor.classId;
    if (query.publishedOnly === 'true') where.publishedAt = { not: null };
  }

  if (query.classId) {
    if (actor.role === 'STUDENT' && query.classId !== actor.classId) throw new ForbiddenError('Kelas lain tidak dapat diakses');
    where.classId = query.classId;
  }
  if (query.subjectId) where.subjectId = query.subjectId;

  const from = query.from ? parseDateKey(query.from) : addDays(todayUtcMidnight(now), -14);
  const to = query.to ? parseDateKey(query.to) : addDays(todayUtcMidnight(now), 120);
  where.examDate = { gte: from, lte: to };

  const rows = (await prisma.examSchedule.findMany({
    where,
    include: examInclude,
    orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }],
    take: 200,
  })) as ExamWithRelations[];

  return { items: rows.map((row) => toDto(row, now)) };
}

export async function getExam(actor: AuthUser, id: string, now: Date = new Date()): Promise<ExamDto> {
  const exam = (await prisma.examSchedule.findFirst({
    where: { id, deletedAt: null },
    include: examInclude,
  })) as ExamWithRelations | null;
  if (!exam) throw new NotFoundError('Jadwal ujian tidak ditemukan');

  if (actor.role === 'STUDENT' && (exam.classId !== actor.classId || !exam.publishedAt)) {
    await logDeniedAttempt(actor, 'exam.read.denied', 'ExamSchedule', id);
    throw new ForbiddenError('Jadwal ujian ini belum dipublikasikan untuk kelasmu');
  }
  if (actor.role === 'PARENT') {
    const links = await prisma.guardianLink.findMany({ where: { parentId: actor.id }, select: { studentId: true } });
    const students = await prisma.user.findMany({
      where: { id: { in: links.map((l) => l.studentId) } },
      select: { classId: true },
    });
    const allowed = students.map((s) => s.classId).filter(Boolean);
    if (!exam.publishedAt || !allowed.includes(exam.classId)) {
      await logDeniedAttempt(actor, 'exam.read.denied', 'ExamSchedule', id);
      throw new ForbiddenError('Jadwal ujian ini tidak dapat diakses');
    }
  }
  if ((actor.role === 'TEACHER' || actor.role === 'CLASS_GUARDIAN') && actor.classId && exam.classId !== actor.classId) {
    await logDeniedAttempt(actor, 'exam.read.denied', 'ExamSchedule', id);
    throw new ForbiddenError('Jadwal ujian berada di kelas lain');
  }

  return toDto(exam, now);
}

export async function createExam(actor: AuthUser, input: CreateExamInput, now: Date = new Date()): Promise<ExamDto> {
  if (!isAuthoring(actor.role)) throw new ForbiddenError('Hanya guru yang dapat membuat jadwal ujian');
  await assertCanManageClass(actor, input.classId);

  const subject = await prisma.subject.findFirst({ where: { id: input.subjectId, deletedAt: null } });
  if (!subject) throw new NotFoundError('Mata pelajaran tidak ditemukan');

  const examDate = parseDateKey(input.examDate);
  const existing = await prisma.examSchedule.findFirst({
    where: { classId: input.classId, subjectId: input.subjectId, examDate, startTime: input.startTime, deletedAt: null },
  });
  if (existing) throw new BadRequestError('Jadwal ujian dengan mata pelajaran dan waktu yang sama sudah ada');

  const created = (await prisma.examSchedule.create({
    data: {
      classId: input.classId,
      subjectId: input.subjectId,
      title: input.title,
      examDate,
      startTime: input.startTime,
      endTime: input.endTime,
      room: input.room ?? null,
      createdById: actor.id,
      publishedAt: input.publish ? now : null,
      publishedById: input.publish ? actor.id : null,
    },
    include: examInclude,
  })) as ExamWithRelations;

  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: input.publish ? 'exam.create_and_publish' : 'exam.create',
    entityType: 'ExamSchedule',
    entityId: created.id,
    metadata: { classId: input.classId, examDate: input.examDate },
  });

  return toDto(created, now);
}

/**
 * Publishes an exam. Publication is the moment the schedule becomes immutable
 * (AGENTS business rule) — after this every mutation returns 403 and is audited.
 */
export async function publishExam(actor: AuthUser, id: string, now: Date = new Date()): Promise<ExamDto> {
  const exam = await prisma.examSchedule.findFirst({ where: { id, deletedAt: null } });
  if (!exam) throw new NotFoundError('Jadwal ujian tidak ditemukan');
  if (!isAuthoring(actor.role)) throw new ForbiddenError('Hanya guru yang dapat mempublikasikan jadwal ujian');
  await assertCanManageClass(actor, exam.classId);

  if (exam.publishedAt) return toDto((await loadExam(id))!, now);

  const updated = (await prisma.examSchedule.update({
    where: { id },
    data: { publishedAt: now, publishedById: actor.id },
    include: examInclude,
  })) as ExamWithRelations;

  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'exam.publish',
    entityType: 'ExamSchedule',
    entityId: id,
    metadata: { classId: exam.classId },
  });

  return toDto(updated, now);
}

function loadExam(id: string) {
  return prisma.examSchedule.findFirst({ where: { id, deletedAt: null }, include: examInclude }) as Promise<
    ExamWithRelations | null
  >;
}

async function assertEditable(actor: AuthUser, id: string): Promise<ExamSchedule> {
  const exam = await prisma.examSchedule.findFirst({ where: { id, deletedAt: null } });
  if (!exam) throw new NotFoundError('Jadwal ujian tidak ditemukan');
  if (!isAuthoring(actor.role)) throw new ForbiddenError('Hanya guru yang dapat mengubah jadwal ujian');
  await assertCanManageClass(actor, exam.classId);

  if (exam.publishedAt) {
    // Immutability rule: audit the attempt before rejecting.
    await writeAudit({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'exam.update.denied',
      entityType: 'ExamSchedule',
      entityId: id,
      metadata: { reason: 'PUBLISHED_EXAM_IMMUTABLE', publishedAt: exam.publishedAt.toISOString() },
    });
    throw new ForbiddenError('Jadwal ujian yang sudah dipublikasikan tidak dapat diubah');
  }
  return exam;
}

export async function updateExam(actor: AuthUser, id: string, input: UpdateExamInput, now: Date = new Date()): Promise<ExamDto> {
  const exam = await assertEditable(actor, id);

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.room !== undefined) data.room = input.room;
  if (input.examDate !== undefined) data.examDate = parseDateKey(input.examDate);
  if (input.startTime !== undefined) data.startTime = input.startTime;
  if (input.endTime !== undefined) data.endTime = input.endTime;
  if (input.subjectId !== undefined) {
    const subject = await prisma.subject.findFirst({ where: { id: input.subjectId, deletedAt: null } });
    if (!subject) throw new NotFoundError('Mata pelajaran tidak ditemukan');
    data.subjectId = input.subjectId;
  }

  const startTime = (data.startTime as string | undefined) ?? exam.startTime;
  const endTime = (data.endTime as string | undefined) ?? exam.endTime;
  if (endTime <= startTime) throw new BadRequestError('Jam selesai harus setelah jam mulai');

  const updated = (await prisma.examSchedule.update({
    where: { id },
    data,
    include: examInclude,
  })) as ExamWithRelations;

  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'exam.update',
    entityType: 'ExamSchedule',
    entityId: id,
    metadata: { changes: Object.keys(data) },
  });

  return toDto(updated, now);
}

export async function deleteExam(actor: AuthUser, id: string): Promise<void> {
  await assertEditable(actor, id);
  await prisma.examSchedule.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'exam.delete',
    entityType: 'ExamSchedule',
    entityId: id,
  });
}