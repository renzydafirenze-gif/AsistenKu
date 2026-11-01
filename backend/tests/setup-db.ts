import { prisma } from '../src/db/prisma';

/**
 * Global test setup: wipes the SQLite mirror before every test so suites are
 * independent. Tables are deleted in FK-safe order (SQLite has no TRUNCATE).
 */
const TABLES = [
  'UniformChecklistItem',
  'UniformChecklist',
  'HomeworkSubmission',
  'NotificationLog',
  'PushToken',
  'SyncChange',
  'EntityState',
  'RefreshToken',
  'AuditLog',
  'DutySchedule',
  'ExamSchedule',
  'Homework',
  'Subject',
  'AcademicCalendar',
  'UniformItem',
  'GuardianLink',
  'User',
  'SchoolClass',
];

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
