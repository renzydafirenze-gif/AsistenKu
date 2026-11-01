import { prisma } from '../../db/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';
import type { AuthUser } from '../../types/express';
import { isAuthoring } from '../../domain/enums';
import { assertCanManageClass } from '../users/access';
import type { CreateSubjectInput, UpdateSubjectInput } from './subject.schemas';

export interface SubjectDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  classId: string | null;
  className: string | null;
  teacher: { id: string; fullName: string; email: string } | null;
  resourceUrl: string | null;
  homeworkCount: number;
}

const subjectInclude = {
  class: { select: { name: true } },
  teacher: { select: { id: true, fullName: true, email: true } },
  _count: { select: { homeworks: true } },
} as const;

type SubjectRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  classId: string | null;
  resourceUrl: string | null;
  class: { name: string } | null;
  teacher: { id: string; fullName: string; email: string } | null;
  _count: { homeworks: number };
};

function toDto(row: SubjectRow): SubjectDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    classId: row.classId,
    className: row.class?.name ?? null,
    teacher: row.teacher ?? null,
    resourceUrl: row.resourceUrl,
    homeworkCount: row._count.homeworks,
  };
}

export async function listSubjects(actor: AuthUser) {
  const where: Record<string, unknown> = { deletedAt: null };

  if (actor.role === 'STUDENT') {
    if (!actor.classId) return { items: [] };
    where.OR = [{ classId: actor.classId }, { classId: null }];
  } else if (actor.role === 'PARENT') {
    const links = await prisma.guardianLink.findMany({ where: { parentId: actor.id }, select: { studentId: true } });
    const students = await prisma.user.findMany({
      where: { id: { in: links.map((l) => l.studentId) } },
      select: { classId: true },
    });
    const classIds = students.map((s) => s.classId).filter((id): id is string => Boolean(id));
    if (classIds.length === 0) return { items: [] };
    where.OR = [{ classId: { in: classIds } }, { classId: null }];
  } else {
    if (!actor.classId) return { items: [] };
    where.OR = [{ classId: actor.classId }, { classId: null }];
  }

  const rows = (await prisma.subject.findMany({
    where,
    include: subjectInclude,
    orderBy: { name: 'asc' },
  })) as SubjectRow[];

  return { items: rows.map(toDto) };
}

export async function createSubject(actor: AuthUser, input: CreateSubjectInput): Promise<SubjectDto> {
  if (!isAuthoring(actor.role)) throw new ForbiddenError('Hanya guru yang dapat menambah mata pelajaran');
  const classId = input.classId ?? actor.classId;
  if (classId) await assertCanManageClass(actor, classId);

  const existing = await prisma.subject.findUnique({ where: { code: input.code } });
  if (existing) throw new ConflictError('Kode mata pelajaran sudah digunakan');

  if (input.teacherId) {
    const teacher = await prisma.user.findFirst({
      where: { id: input.teacherId, role: { in: ['TEACHER', 'CLASS_GUARDIAN'] }, deletedAt: null },
    });
    if (!teacher) throw new NotFoundError('Guru tidak ditemukan');
  }

  const created = (await prisma.subject.create({
    data: {
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      classId: classId ?? null,
      teacherId: input.teacherId ?? null,
      resourceUrl: input.resourceUrl ?? null,
    },
    include: subjectInclude,
  })) as SubjectRow;

  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'subject.create',
    entityType: 'Subject',
    entityId: created.id,
  });

  return toDto(created);
}

export async function updateSubject(actor: AuthUser, id: string, input: UpdateSubjectInput): Promise<SubjectDto> {
  if (!isAuthoring(actor.role)) throw new ForbiddenError('Hanya guru yang dapat mengubah mata pelajaran');
  const subject = await prisma.subject.findFirst({ where: { id, deletedAt: null } });
  if (!subject) throw new NotFoundError('Mata pelajaran tidak ditemukan');
  await assertCanManageClass(actor, subject.classId);

  if (input.teacherId) {
    const teacher = await prisma.user.findFirst({
      where: { id: input.teacherId, role: { in: ['TEACHER', 'CLASS_GUARDIAN'] }, deletedAt: null },
    });
    if (!teacher) throw new NotFoundError('Guru tidak ditemukan');
  }

  const updated = (await prisma.subject.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.teacherId !== undefined ? { teacherId: input.teacherId } : {}),
      ...(input.resourceUrl !== undefined ? { resourceUrl: input.resourceUrl } : {}),
    },
    include: subjectInclude,
  })) as SubjectRow;

  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'subject.update',
    entityType: 'Subject',
    entityId: id,
    metadata: { changes: Object.keys(input) },
  });

  return toDto(updated);
}

export async function deleteSubject(actor: AuthUser, id: string): Promise<void> {
  if (!isAuthoring(actor.role)) throw new ForbiddenError('Hanya guru yang dapat menghapus mata pelajaran');
  const subject = await prisma.subject.findFirst({ where: { id, deletedAt: null } });
  if (!subject) throw new NotFoundError('Mata pelajaran tidak ditemukan');
  await assertCanManageClass(actor, subject.classId);

  const activeHomework = await prisma.homework.count({ where: { subjectId: id, deletedAt: null } });
  if (activeHomework > 0) throw new ConflictError('Mata pelajaran masih memiliki tugas aktif');

  await prisma.subject.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'subject.delete',
    entityType: 'Subject',
    entityId: id,
  });
}