import request from 'supertest';
import type { Application } from 'express';
import { prisma } from '../../src/db/prisma';
import { hashPassword } from '../../src/lib/password';
import { toDateKey, todayUtcMidnight, addDays } from '../../src/lib/dates';

let classCounter = 0;
let emailCounter = 0;

export const TEST_PASSWORD = 'Rahasia123';
export const TEST_INVITE_CODE = 'test-staff-invite-code-value';

export async function createClass(name = `Kelas 10-${++classCounter}`) {
  return prisma.schoolClass.create({
    data: { name, gradeLevel: 10, academicYear: '2026/2027', homeroomName: 'Bu Sari' },
  });
}

export interface UserOverrides {
  email?: string;
  password?: string;
  fullName?: string;
  role?: 'STUDENT' | 'PARENT' | 'TEACHER' | 'CLASS_GUARDIAN';
  classId?: string | null;
  phone?: string;
  address?: string;
}

/** Direct DB user (bypasses HTTP for tests that are not about auth). */
export async function createUser(overrides: UserOverrides = {}) {
  const email = overrides.email ?? `user${++emailCounter}@sekolah.test`;
  return prisma.user.create({
    data: {
      email,
      fullName: overrides.fullName ?? 'Budi Santoso',
      role: overrides.role ?? 'STUDENT',
      classId: overrides.classId ?? null,
      passwordHash: await hashPassword(overrides.password ?? TEST_PASSWORD),
    },
  });
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    role: string;
    fullName: string;
    classId: string | null;
  };
  accessToken: string;
  refreshToken: string;
  header: { Authorization: string };
}

/** Registers through the real endpoint so onboarding is exercised end to end. */
export async function registerUser(app: Application, overrides: UserOverrides = {}): Promise<AuthResult> {
  const email = overrides.email ?? `user${++emailCounter}@sekolah.test`;
  const password = overrides.password ?? TEST_PASSWORD;
  const role = overrides.role ?? 'STUDENT';

  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({
      email,
      password,
      fullName: overrides.fullName ?? 'Budi Santoso',
      role,
      ...(overrides.classId ? { classId: overrides.classId } : {}),
      ...(role === 'TEACHER' || role === 'CLASS_GUARDIAN' ? { inviteCode: TEST_INVITE_CODE } : {}),
      ...(overrides.phone ? { phone: overrides.phone } : {}),
      ...(overrides.address ? { address: overrides.address } : {}),
    });

  if (response.status !== 201) {
    throw new Error(`registerUser failed (${response.status}): ${JSON.stringify(response.body)}`);
  }

  return {
    user: response.body.user,
    accessToken: response.body.tokens.accessToken,
    refreshToken: response.body.tokens.refreshToken,
    header: { Authorization: `Bearer ${response.body.tokens.accessToken}` },
  };
}

export async function createSubject(overrides: { classId?: string | null; code?: string; name?: string; teacherId?: string } = {}) {
  return prisma.subject.create({
    data: {
      code: overrides.code ?? `MTK${++classCounter}`,
      name: overrides.name ?? 'Matematika',
      classId: overrides.classId ?? null,
      teacherId: overrides.teacherId ?? null,
    },
  });
}

export async function createDuty(overrides: {
  classId: string;
  assignedStudentId: string;
  createdById: string;
  date?: Date;
  shift?: 'MORNING' | 'AFTERNOON';
  completedAt?: Date | null;
}) {
  return prisma.dutySchedule.create({
    data: {
      classId: overrides.classId,
      assignedStudentId: overrides.assignedStudentId,
      createdById: overrides.createdById,
      date: overrides.date ?? todayUtcMidnight(),
      shift: overrides.shift ?? 'MORNING',
      completedAt: overrides.completedAt ?? null,
    },
  });
}

export async function createHomework(overrides: {
  classId?: string | null;
  subjectId: string;
  createdById: string;
  ownerStudentId?: string | null;
  title?: string;
  dueDate?: Date;
}) {
  return prisma.homework.create({
    data: {
      classId: overrides.classId ?? null,
      subjectId: overrides.subjectId,
      createdById: overrides.createdById,
      ownerStudentId: overrides.ownerStudentId ?? null,
      title: overrides.title ?? 'Latihan 1',
      dueDate: overrides.dueDate ?? addDays(new Date(), 3),
      publishedAt: new Date(),
    },
  });
}

export async function createExam(overrides: {
  classId: string;
  subjectId: string;
  createdById: string;
  examDate?: Date;
  startTime?: string;
  endTime?: string;
  publishedAt?: Date | null;
}) {
  return prisma.examSchedule.create({
    data: {
      classId: overrides.classId,
      subjectId: overrides.subjectId,
      createdById: overrides.createdById,
      title: 'UTS',
      examDate: overrides.examDate ?? addDays(new Date(), 5),
      startTime: overrides.startTime ?? '08:00',
      endTime: overrides.endTime ?? '10:00',
      publishedAt: overrides.publishedAt ?? null,
    },
  });
}

export async function createUniformCatalog() {
  const items = await Promise.all([
    prisma.uniformItem.create({ data: { key: 'kemeja_putih', label: 'Kemeja Putih', category: 'DAILY', isDefault: true } }),
    prisma.uniformItem.create({ data: { key: 'celana_navy', label: 'Celana Navy', category: 'DAILY', isDefault: true } }),
    prisma.uniformItem.create({ data: { key: 'dasi', label: 'Dasi', category: 'CEREMONY', isDefault: true } }),
    prisma.uniformItem.create({ data: { key: 'seragam_olahraga', label: 'Seragam Olahraga', category: 'SPORTS', isDefault: false } }),
  ]);
  return items;
}

export async function createCalendarDay(date: Date, dayType: 'SCHOOL_DAY' | 'HOLIDAY' | 'EXAM_DAY' | 'EVENT', keys: string[]) {
  return prisma.academicCalendar.create({
    data: { date, dayType, uniformItems: keys.join(',') },
  });
}

export function dateKey(date: Date): string {
  return toDateKey(date);
}

export { addDays, todayUtcMidnight };
