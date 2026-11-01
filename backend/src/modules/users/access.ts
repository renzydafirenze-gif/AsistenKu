import { prisma } from '../../db/prisma';
import { ForbiddenError, NotFoundError } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';
import type { AuthUser } from '../../types/express';

/**
 * Central place for "who may see whose data" decisions.
 * Keeping it in one module means the rules cannot drift between endpoints.
 */

export async function assertCanViewStudent(actor: AuthUser, studentId: string): Promise<void> {
  if (actor.id === studentId) return;

  if (actor.role === 'PARENT') {
    const link = await prisma.guardianLink.findFirst({ where: { parentId: actor.id, studentId } });
    if (link) return;
    throw new ForbiddenError('Kamu hanya dapat melihat data anak yang terhubung');
  }

  if (actor.role === 'TEACHER' || actor.role === 'CLASS_GUARDIAN') {
    const student = await prisma.user.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { classId: true, role: true },
    });
    if (!student) throw new NotFoundError('Siswa tidak ditemukan');
    if (student.role !== 'STUDENT') throw new ForbiddenError('Target bukan siswa');
    // A staff member without a class assignment (e.g. a subject teacher covering
    // several classes) may read any student; a homeroom-scoped one may not leave
    // their class.
    if (!actor.classId || student.classId === actor.classId) return;
    throw new ForbiddenError('Siswa berada di kelas lain');
  }

  throw new ForbiddenError('Tidak memiliki akses ke data siswa ini');
}

export async function assertCanManageClass(actor: AuthUser, classId: string | null): Promise<void> {
  if (actor.role !== 'TEACHER' && actor.role !== 'CLASS_GUARDIAN') {
    throw new ForbiddenError('Hanya guru atau wali kelas yang dapat mengelola data kelas');
  }
  // A null classId on the actor means unscoped staff (see assertCanViewStudent).
  if (actor.classId && classId && classId !== actor.classId) {
    throw new ForbiddenError('Tidak dapat mengelola kelas lain');
  }
}

/** Resolves the set of student ids an actor is allowed to read. */
export async function visibleStudentIds(actor: AuthUser): Promise<string[]> {
  if (actor.role === 'STUDENT') return [actor.id];
  if (actor.role === 'PARENT') {
    const links = await prisma.guardianLink.findMany({ where: { parentId: actor.id }, select: { studentId: true } });
    return links.map((l) => l.studentId);
  }
  const students = await prisma.user.findMany({
    where: { role: 'STUDENT', deletedAt: null, ...(actor.classId ? { classId: actor.classId } : {}) },
    select: { id: true },
  });
  return students.map((s) => s.id);
}

export async function logDeniedAttempt(
  actor: AuthUser | undefined,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await writeAudit({
    actorId: actor?.id ?? null,
    actorRole: actor?.role ?? null,
    action,
    entityType,
    entityId,
    metadata,
  });
}