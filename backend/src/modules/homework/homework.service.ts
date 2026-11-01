import type { Homework, HomeworkSubmission, Subject } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { zonedTimeToUtc } from '../../lib/dates';
import { writeAudit } from '../../lib/audit';
import type { AuthUser } from '../../types/express';
import { isAuthoring, type HomeworkStatus } from '../../domain/enums';
import { assertCanManageClass, assertCanViewStudent, logDeniedAttempt } from '../users/access';
import { HOMEWORK_COLORS, type HomeworkDto, type HomeworkSummary } from './homework.types';
import type { CreateHomeworkInput, ListHomeworkQuery, UpdateHomeworkInput } from './homework.schemas';

/** Accepts an ISO instant or a `YYYY-MM-DD` school-day key (end of day, local). */
export function parseDueDate(input: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return zonedTimeToUtc(input, 23, 59);
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) throw new BadRequestError('Tenggat tidak valid');
  return date;
}

type HomeworkWithSubject = Homework & { subject: Pick<Subject, 'id' | 'name' | 'code'> };

const homeworkInclude = { subject: { select: { id: true, name: true, code: true } } } as const;

export function isPastDue(homework: Pick<Homework, 'dueDate'>, now: Date): boolean {
  return now.getTime() > homework.dueDate.getTime();
}

function summarize(submissions: HomeworkSubmission[]): HomeworkSummary {
  const summary: HomeworkSummary = { total: 0, pending: 0, submitted: 0, graded: 0, late: 0 };
  for (const submission of submissions) {
    summary.total += 1;
    if (submission.status === 'GRADED') summary.graded += 1;
    else if (submission.status === 'SUBMITTED') summary.submitted += 1;
    else summary.pending += 1;
    if (submission.isLate) summary.late += 1;
  }
  return summary;
}

/** Status of one student's own homework, from their perspective. */
function studentStatus(submission: HomeworkSubmission | null): HomeworkStatus {
  if (submission?.status === 'GRADED') return 'GRADED';
  if (submission?.status === 'SUBMITTED') return 'SUBMITTED';
  return 'PENDING';
}

function studentAccent(status: HomeworkStatus, isLate: boolean): string {
  if (isLate) return HOMEWORK_COLORS.LATE;
  if (status === 'GRADED') return HOMEWORK_COLORS.GRADED;
  if (status === 'SUBMITTED') return HOMEWORK_COLORS.DONE;
  return HOMEWORK_COLORS.UPCOMING;
}

function buildStudentDto(
  homework: HomeworkWithSubject,
  submission: HomeworkSubmission | null,
  student: { id: string; fullName: string },
  now: Date,
): HomeworkDto {
  const status = studentStatus(submission);
  const pastDue = isPastDue(homework, now);
  const isLate = Boolean(submission?.isLate) || (pastDue && status === 'PENDING');
  const isOwnTask = homework.ownerStudentId === student.id;

  return {
    id: homework.id,
    subject: homework.subject,
    classId: homework.classId,
    title: homework.title,
    description: homework.description,
    dueDate: homework.dueDate.toISOString(),
    publishedAt: homework.publishedAt?.toISOString() ?? null,
    createdAt: homework.createdAt.toISOString(),
    isOverdue: pastDue,
    isLate,
    accentColor: studentAccent(status, isLate),
    assignment: { studentId: student.id, studentName: student.fullName },
    status,
    submittedAt: submission?.submittedAt?.toISOString() ?? null,
    grade: submission?.grade ?? null,
    feedback: submission?.feedback ?? null,
    permissions: {
      // Students may only edit their own personal task, and never once it is late.
      canEdit: isOwnTask && !isLate && status !== 'GRADED',
      canDelete: isOwnTask && !isLate,
      canSubmit: status === 'PENDING',
      canGrade: false,
    },
  };
}

function buildStaffDto(
  homework: HomeworkWithSubject,
  submissions: HomeworkSubmission[],
  now: Date,
): HomeworkDto {
  const summary = summarize(submissions);
  const pastDue = isPastDue(homework, now);
  const isLate = summary.late > 0 || (pastDue && summary.pending > 0);
  const status: HomeworkStatus =
    summary.total > 0 && summary.graded === summary.total
      ? 'GRADED'
      : summary.total > 0 && summary.submitted + summary.graded === summary.total
        ? 'SUBMITTED'
        : 'PENDING';

  return {
    id: homework.id,
    subject: homework.subject,
    classId: homework.classId,
    title: homework.title,
    description: homework.description,
    dueDate: homework.dueDate.toISOString(),
    publishedAt: homework.publishedAt?.toISOString() ?? null,
    createdAt: homework.createdAt.toISOString(),
    isOverdue: pastDue,
    isLate,
    accentColor: isLate ? HOMEWORK_COLORS.LATE : status === 'GRADED' ? HOMEWORK_COLORS.GRADED : HOMEWORK_COLORS.UPCOMING,
    assignment: null,
    status,
    submittedAt: null,
    grade: null,
    feedback: null,
    summary,
    permissions: {
      canEdit: summary.graded === 0,
      canDelete: !isLate,
      canSubmit: false,
      canGrade: summary.submitted > 0,
    },
  };
}

async function linkedStudentIds(parentId: string): Promise<string[]> {
  const links = await prisma.guardianLink.findMany({ where: { parentId }, select: { studentId: true } });
  return links.map((l) => l.studentId);
}

/** Resolves which students the viewer represents when reading homework. */
async function viewerStudentIds(actor: AuthUser): Promise<string[]> {
  if (actor.role === 'STUDENT') return [actor.id];
  if (actor.role === 'PARENT') return linkedStudentIds(actor.id);
  return [];
}

export async function listHomework(
  actor: AuthUser,
  query: ListHomeworkQuery,
  now: Date = new Date(),
): Promise<{ items: HomeworkDto[]; nextCursor: string | null }> {
  const where: Record<string, unknown> = { deletedAt: null };
  const isLearner = actor.role === 'STUDENT' || actor.role === 'PARENT';

  if (isLearner) {
    const studentIds = query.studentId ? [query.studentId] : await viewerStudentIds(actor);
    if (query.studentId && actor.role === 'PARENT') await assertCanViewStudent(actor, query.studentId);
    if (studentIds.length === 0) return { items: [], nextCursor: null };

    const students = await prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, classId: true },
    });
    const classIds = students.map((s) => s.classId).filter((id): id is string => Boolean(id));
    where.OR = [
      ...(classIds.length > 0 ? [{ classId: { in: classIds } }] : []),
      { ownerStudentId: { in: studentIds } },
    ];
  } else {
    // Staff scope: an explicit classId wins, otherwise the caller's own class.
    // Unscoped staff (no homeroom) may query any single class explicitly.
    const scopeClassId = query.classId ?? actor.classId;
    if (!scopeClassId) return { items: [], nextCursor: null };
    if (actor.classId && scopeClassId !== actor.classId) {
      throw new ForbiddenError('Tidak dapat melihat kelas lain');
    }
    where.classId = scopeClassId;
  }

  if (query.classId && isLearner) where.classId = query.classId;
  if (query.subjectId) where.subjectId = query.subjectId;

  const rows = (await prisma.homework.findMany({
    where,
    include: homeworkInclude,
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  })) as HomeworkWithSubject[];

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]!.id : null;
  const homeworkIds = page.map((row) => row.id);

  let items: HomeworkDto[];

  if (isLearner) {
    const studentIds = query.studentId ? [query.studentId] : await viewerStudentIds(actor);
    const students = await prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, fullName: true, classId: true },
    });
    const studentById = new Map(students.map((s) => [s.id, s]));
    const submissions = await prisma.homeworkSubmission.findMany({
      where: { homeworkId: { in: homeworkIds }, studentId: { in: studentIds } },
    });
    const key = (homeworkId: string, studentId: string) => `${homeworkId}:${studentId}`;
    const submissionByKey = new Map(submissions.map((s) => [key(s.homeworkId, s.studentId), s]));

    items = [];
    for (const row of page) {
      for (const studentId of studentIds) {
        const student = studentById.get(studentId);
        if (!student) continue;
        const belongsToStudent = row.ownerStudentId === studentId;
        const isForClass = row.classId !== null && row.classId === student.classId;
        if (!belongsToStudent && !isForClass) continue;
        items.push(buildStudentDto(row, submissionByKey.get(key(row.id, studentId)) ?? null, student, now));
      }
    }
  } else {
    const submissions = await prisma.homeworkSubmission.findMany({ where: { homeworkId: { in: homeworkIds } } });
    const byHomework = new Map<string, HomeworkSubmission[]>();
    for (const submission of submissions) {
      const list = byHomework.get(submission.homeworkId) ?? [];
      list.push(submission);
      byHomework.set(submission.homeworkId, list);
    }
    items = page.map((row) => buildStaffDto(row, byHomework.get(row.id) ?? [], now));
  }

  const filtered = items.filter((item) => {
    if (query.status && item.status !== query.status) return false;
    if (query.lateOnly === 'true' && !item.isLate) return false;
    return true;
  });

  return { items: filtered, nextCursor };
}

export async function getHomework(actor: AuthUser, id: string, now: Date = new Date()): Promise<HomeworkDto> {
  const homework = (await prisma.homework.findFirst({
    where: { id, deletedAt: null },
    include: { ...homeworkInclude, submissions: { include: { student: { select: { id: true, fullName: true } } } } },
  })) as (HomeworkWithSubject & {
    submissions: (HomeworkSubmission & { student: { id: string; fullName: string } })[];
  }) | null;
  if (!homework) throw new NotFoundError('Tugas tidak ditemukan');

  if (actor.role === 'STUDENT' || actor.role === 'PARENT') {
    const studentIds = await viewerStudentIds(actor);
    const targetId =
      actor.role === 'STUDENT'
        ? actor.id
        : homework.submissions.find((s) => studentIds.includes(s.studentId))?.studentId ?? null;

    if (!targetId) {
      await logDeniedAttempt(actor, 'homework.read.denied', 'Homework', id);
      throw new ForbiddenError('Tugas ini tidak terkait dengan akunmu');
    }
    if (actor.role === 'PARENT') await assertCanViewStudent(actor, targetId);

    const student = await prisma.user.findUniqueOrThrow({
      where: { id: targetId },
      select: { id: true, fullName: true, classId: true },
    });
    const related = homework.ownerStudentId === targetId || (homework.classId !== null && homework.classId === student.classId);
    if (!related) {
      await logDeniedAttempt(actor, 'homework.read.denied', 'Homework', id);
      throw new ForbiddenError('Tugas ini bukan untuk kelasmu');
    }

    const submission = homework.submissions.find((s) => s.studentId === targetId) ?? null;
    return buildStudentDto(homework, submission, student, now);
  }

  if (actor.classId && homework.classId !== actor.classId) {
    await logDeniedAttempt(actor, 'homework.read.denied', 'Homework', id);
    throw new ForbiddenError('Tugas berada di kelas lain');
  }

  return buildStaffDto(homework, homework.submissions, now);
}

export async function createHomework(
  actor: AuthUser,
  input: CreateHomeworkInput,
  now: Date = new Date(),
): Promise<HomeworkDto> {
  const dueDate = parseDueDate(input.dueDate);
  if (dueDate.getTime() <= now.getTime()) throw new BadRequestError('Tenggat harus di masa depan');

  const subject = await prisma.subject.findFirst({ where: { id: input.subjectId, deletedAt: null } });
  if (!subject) throw new NotFoundError('Mata pelajaran tidak ditemukan');

  if (actor.role === 'STUDENT') {
    if (input.classId) throw new ForbiddenError('Siswa hanya dapat membuat tugas pribadi');
    const created = (await prisma.homework.create({
      data: {
        classId: null,
        ownerStudentId: actor.id,
        subjectId: subject.id,
        title: input.title,
        description: input.description ?? null,
        dueDate,
        createdById: actor.id,
        publishedAt: now,
      },
      include: homeworkInclude,
    })) as HomeworkWithSubject;

    return buildStudentDto(created, null, { id: actor.id, fullName: actor.fullName }, now);
  }

  if (!isAuthoring(actor.role)) throw new ForbiddenError('Peran ini tidak dapat membuat tugas');

  const classId = input.classId ?? actor.classId;
  if (!classId) throw new BadRequestError('Kelas wajib diisi');
  await assertCanManageClass(actor, classId);
  if (subject.classId && subject.classId !== classId) throw new BadRequestError('Mata pelajaran bukan untuk kelas ini');

  const created = await prisma.homework.create({
    data: {
      classId,
      subjectId: subject.id,
      title: input.title,
      description: input.description ?? null,
      dueDate,
      createdById: actor.id,
      publishedAt: now,
    },
    include: homeworkInclude,
  });

  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'homework.create',
    entityType: 'Homework',
    entityId: created.id,
    metadata: { classId, dueDate: dueDate.toISOString() },
  });

  return buildStaffDto(created as HomeworkWithSubject, [], now);
}

export async function updateHomework(
  actor: AuthUser,
  id: string,
  input: UpdateHomeworkInput,
  now: Date = new Date(),
): Promise<HomeworkDto> {
  const homework = await prisma.homework.findFirst({ where: { id, deletedAt: null }, include: { submissions: true } });
  if (!homework) throw new NotFoundError('Tugas tidak ditemukan');

  const isCreator = homework.createdById === actor.id;
  const canManage = isCreator || (isAuthoring(actor.role) && homework.classId === actor.classId);
  if (!canManage) {
    await logDeniedAttempt(actor, 'homework.update.denied', 'Homework', id);
    throw new ForbiddenError('Tidak dapat mengubah tugas ini');
  }
  if (homework.submissions.some((s) => s.status === 'GRADED')) {
    throw new ConflictError('Tugas yang sudah dinilai tidak dapat diubah');
  }
  // A late personal task is frozen for the student, matching the delete rule.
  if (actor.role === 'STUDENT' && isPastDue(homework, now)) {
    throw new ForbiddenError('Tugas yang sudah terlambat tidak dapat diubah');
  }

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.subjectId !== undefined) {
    const subject = await prisma.subject.findFirst({ where: { id: input.subjectId, deletedAt: null } });
    if (!subject) throw new NotFoundError('Mata pelajaran tidak ditemukan');
    data.subjectId = input.subjectId;
  }
  if (input.dueDate !== undefined) {
    const dueDate = parseDueDate(input.dueDate);
    if (dueDate.getTime() <= now.getTime()) throw new BadRequestError('Tenggat harus di masa depan');
    data.dueDate = dueDate;
  }

  const updated = (await prisma.homework.update({
    where: { id },
    data,
    include: homeworkInclude,
  })) as HomeworkWithSubject;

  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'homework.update',
    entityType: 'Homework',
    entityId: id,
    metadata: { changes: Object.keys(data) },
  });

  if (actor.role === 'STUDENT') {
    return buildStudentDto(updated, null, { id: actor.id, fullName: actor.fullName }, now);
  }
  return buildStaffDto(updated, homework.submissions, now);
}

/**
 * Soft-deletes a homework.
 *
 * Business rule: once a task is late it can never be deleted — by anyone. The
 * attempt is audited so the school can review who tried.
 */
export async function deleteHomework(actor: AuthUser, id: string, now: Date = new Date()): Promise<void> {
  const homework = await prisma.homework.findFirst({ where: { id, deletedAt: null }, include: { submissions: true } });
  if (!homework) throw new NotFoundError('Tugas tidak ditemukan');

  const isCreator = homework.createdById === actor.id;
  const canManage = isCreator || (isAuthoring(actor.role) && homework.classId === actor.classId);
  if (!canManage) {
    await logDeniedAttempt(actor, 'homework.delete.denied', 'Homework', id);
    throw new ForbiddenError('Tidak dapat menghapus tugas ini');
  }

  const late = isPastDue(homework, now) || homework.submissions.some((s) => s.isLate);
  if (late) {
    await writeAudit({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'homework.delete.denied',
      entityType: 'Homework',
      entityId: id,
      metadata: { reason: 'LATE_HOMEWORK_IMMUTABLE', dueDate: homework.dueDate.toISOString() },
    });
    throw new ForbiddenError('Tugas yang sudah terlambat tidak dapat dihapus');
  }

  await prisma.homework.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'homework.delete',
    entityType: 'Homework',
    entityId: id,
  });
}

export interface SubmissionRow {
  studentId: string;
  studentName: string;
  status: HomeworkStatus;
  submittedAt: string | null;
  isLate: boolean;
  grade: number | null;
  feedback: string | null;
}

export async function listSubmissions(
  actor: AuthUser,
  homeworkId: string,
  now: Date = new Date(),
): Promise<SubmissionRow[]> {
  const homework = await prisma.homework.findFirst({ where: { id: homeworkId, deletedAt: null } });
  if (!homework) throw new NotFoundError('Tugas tidak ditemukan');

  if (actor.role === 'STUDENT' || actor.role === 'PARENT') {
    const studentIds = await viewerStudentIds(actor);
    const students = await prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, fullName: true },
    });
    const submissions = await prisma.homeworkSubmission.findMany({
      where: { homeworkId, studentId: { in: studentIds } },
    });
    const byStudent = new Map(submissions.map((s) => [s.studentId, s]));
    return students.map((student) => {
      const submission = byStudent.get(student.id);
      return {
        studentId: student.id,
        studentName: student.fullName,
        status: studentStatus(submission ?? null),
        submittedAt: submission?.submittedAt?.toISOString() ?? null,
        isLate: submission?.isLate ?? isPastDue(homework, now),
        grade: submission?.grade ?? null,
        feedback: submission?.feedback ?? null,
      };
    });
  }

  await assertCanManageClass(actor, homework.classId);

  if (!homework.classId) {
    const owner = homework.ownerStudentId
      ? await prisma.user.findUnique({ where: { id: homework.ownerStudentId }, select: { id: true, fullName: true } })
      : null;
    return owner
      ? [
          {
            studentId: owner.id,
            studentName: owner.fullName,
            status: 'PENDING',
            submittedAt: null,
            isLate: isPastDue(homework, now),
            grade: null,
            feedback: null,
          },
        ]
      : [];
  }

  const [students, submissions] = await Promise.all([
    prisma.user.findMany({
      where: { classId: homework.classId, role: 'STUDENT', deletedAt: null },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    }),
    prisma.homeworkSubmission.findMany({ where: { homeworkId } }),
  ]);
  const byStudent = new Map(submissions.map((s) => [s.studentId, s]));

  return students.map((student) => {
    const submission = byStudent.get(student.id);
    return {
      studentId: student.id,
      studentName: student.fullName,
      status: studentStatus(submission ?? null),
      submittedAt: submission?.submittedAt?.toISOString() ?? null,
      isLate: submission?.isLate ?? isPastDue(homework, now),
      grade: submission?.grade ?? null,
      feedback: submission?.feedback ?? null,
    };
  });
}

export async function submitHomework(
  actor: AuthUser,
  homeworkId: string,
  now: Date = new Date(),
): Promise<HomeworkDto> {
  if (actor.role !== 'STUDENT') throw new ForbiddenError('Hanya siswa yang dapat mengumpulkan tugas');

  const homework = (await prisma.homework.findFirst({
    where: { id: homeworkId, deletedAt: null },
    include: homeworkInclude,
  })) as HomeworkWithSubject | null;
  if (!homework) throw new NotFoundError('Tugas tidak ditemukan');

  const related = homework.ownerStudentId === actor.id || (homework.classId !== null && homework.classId === actor.classId);
  if (!related) {
    await logDeniedAttempt(actor, 'homework.submit.denied', 'Homework', homeworkId);
    throw new ForbiddenError('Tugas ini bukan untuk kelasmu');
  }

  const existing = await prisma.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId, studentId: actor.id } },
  });
  if (existing?.status === 'GRADED') throw new ConflictError('Tugas sudah dinilai dan tidak dapat dikumpulkan ulang');

  const isLate = isPastDue(homework, now);
  const submission = await prisma.homeworkSubmission.upsert({
    where: { homeworkId_studentId: { homeworkId, studentId: actor.id } },
    create: { homeworkId, studentId: actor.id, status: 'SUBMITTED', submittedAt: now, isLate },
    update: { status: 'SUBMITTED', submittedAt: now, isLate },
  });

  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'homework.submit',
    entityType: 'HomeworkSubmission',
    entityId: submission.id,
    metadata: { homeworkId, isLate },
  });

  return buildStudentDto(homework, submission, { id: actor.id, fullName: actor.fullName }, now);
}

export async function gradeHomework(
  actor: AuthUser,
  homeworkId: string,
  input: { studentId: string; grade: number; feedback?: string },
  now: Date = new Date(),
): Promise<SubmissionRow> {
  if (!isAuthoring(actor.role)) throw new ForbiddenError('Hanya guru yang dapat menilai tugas');

  const homework = await prisma.homework.findFirst({ where: { id: homeworkId, deletedAt: null } });
  if (!homework) throw new NotFoundError('Tugas tidak ditemukan');
  await assertCanManageClass(actor, homework.classId);

  const student = await prisma.user.findFirst({
    where: { id: input.studentId, deletedAt: null, role: 'STUDENT' },
    select: { id: true, fullName: true, classId: true },
  });
  if (!student) throw new NotFoundError('Siswa tidak ditemukan');
  if (homework.classId && student.classId !== homework.classId) {
    throw new BadRequestError('Siswa bukan anggota kelas tugas ini');
  }

  const submission = await prisma.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId, studentId: input.studentId } },
  });
  if (!submission || submission.status === 'PENDING') {
    throw new ConflictError('Siswa belum mengumpulkan tugas ini');
  }

  const updated = await prisma.homeworkSubmission.update({
    where: { id: submission.id },
    data: { grade: input.grade, feedback: input.feedback ?? null, status: 'GRADED', gradedAt: now },
  });

  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'homework.grade',
    entityType: 'HomeworkSubmission',
    entityId: updated.id,
    metadata: { homeworkId, studentId: input.studentId, grade: input.grade },
  });

  return {
    studentId: student.id,
    studentName: student.fullName,
    status: 'GRADED',
    submittedAt: updated.submittedAt?.toISOString() ?? null,
    isLate: updated.isLate,
    grade: updated.grade,
    feedback: updated.feedback,
  };
}