/**
 * Demo seed for local review (SQLite). Idempotent: wipes the demo tables first.
 *
 *   npm run demo:db && npm run demo:seed
 *
 * Never point this at production data — it deletes every row it knows about.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password';
import { addDays, todayUtcMidnight } from '../src/lib/dates';

// The SQLite client generated for tests; identical models, different provider.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient: SqliteClient } = require('../generated/test-client') as {
  PrismaClient: new (options: unknown) => PrismaClient;
};

const prisma = new SqliteClient({
  datasources: { db: { url: process.env.DATABASE_URL ?? 'file:./prisma/demo.db' } },
});

const PASSWORD = 'Rahasia123';

async function main() {
  const passwordHash = await hashPassword(PASSWORD);

  // Order matters: children before parents.
  await prisma.auditLog.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.syncChange.deleteMany();
  await prisma.entityState.deleteMany();
  await prisma.homeworkSubmission.deleteMany();
  await prisma.uniformChecklistItem.deleteMany();
  await prisma.uniformChecklist.deleteMany();
  await prisma.homework.deleteMany();
  await prisma.examSchedule.deleteMany();
  await prisma.dutySchedule.deleteMany();
  await prisma.academicCalendar.deleteMany();
  await prisma.uniformItem.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.pushToken.deleteMany();
  await prisma.guardianLink.deleteMany();
  await prisma.user.deleteMany();
  await prisma.schoolClass.deleteMany();

  const schoolClass = await prisma.schoolClass.create({
    data: { name: 'X IPA 1', gradeLevel: 10, academicYear: '2026/2027', homeroomName: 'Bu Sari' },
  });

  const teacher = await prisma.user.create({
    data: {
      email: 'sari@sekolah.test',
      fullName: 'Sari Wulandari',
      role: 'TEACHER',
      classId: schoolClass.id,
      passwordHash,
    },
  });

  const students = await Promise.all(
    [
      { email: 'ani@sekolah.test', fullName: 'Ani Lestari' },
      { email: 'beni@sekolah.test', fullName: 'Beni Pratama' },
      { email: 'citra@sekolah.test', fullName: 'Citra Dewi' },
    ].map((student) =>
      prisma.user.create({
        data: { ...student, role: 'STUDENT', classId: schoolClass.id, passwordHash },
      }),
    ),
  );
  const [ani, beni] = students;

  const subjects = await Promise.all(
    [
      { code: 'MTK', name: 'Matematika' },
      { code: 'BIN', name: 'Bahasa Indonesia' },
      { code: 'IPA', name: 'IPA Terpadu' },
    ].map((subject) =>
      prisma.subject.create({
        data: { ...subject, classId: schoolClass.id, teacherId: teacher.id },
      }),
    ),
  );
  const [matematika, bahasa, ipa] = subjects;

  const uniformItems = await Promise.all(
    [
      { key: 'shirt', label: 'Kemeja putih', category: 'Atasan' },
      { key: 'trousers', label: 'Celana abu-abu', category: 'Bawahan' },
      { key: 'tie', label: 'Dasi', category: 'Atribut' },
      { key: 'shoes', label: 'Sepatu hitam', category: 'Alas kaki' },
      { key: 'socks', label: 'Kaos kaki putih', category: 'Alas kaki' },
    ].map((item, index) =>
      prisma.uniformItem.create({
        data: { ...item, isDefault: index < 4, isActive: true },
      }),
    ),
  );

  const today = todayUtcMidnight();
  const defaultKeys = uniformItems
    .filter((item) => item.isDefault)
    .map((item) => item.key)
    .join(',');

  await prisma.academicCalendar.createMany({
    data: [
      { date: today, dayType: 'SCHOOL_DAY', uniformItems: defaultKeys },
      { date: addDays(today, 1), dayType: 'SCHOOL_DAY', uniformItems: defaultKeys },
      { date: addDays(today, 2), dayType: 'HOLIDAY', uniformItems: '', note: 'Libur nasional' },
    ],
  });

  await prisma.dutySchedule.createMany({
    data: [
      {
        classId: schoolClass.id,
        assignedStudentId: ani!.id,
        createdById: teacher.id,
        date: addDays(today, -1),
        shift: 'MORNING',
        completedAt: addDays(today, -1),
        notes: 'Bersihkan papan tulis',
      },
      {
        classId: schoolClass.id,
        assignedStudentId: ani!.id,
        createdById: teacher.id,
        date: today,
        shift: 'MORNING',
        notes: 'Sapu dan pel lantai',
      },
      {
        classId: schoolClass.id,
        assignedStudentId: beni!.id,
        createdById: teacher.id,
        date: addDays(today, 1),
        shift: 'AFTERNOON',
      },
    ],
  });

  await prisma.homework.createMany({
    data: [
      {
        classId: schoolClass.id,
        subjectId: matematika!.id,
        title: 'Latihan pecahan halaman 42',
        description: 'Kerjakan soal 1–10 di buku tulis.',
        dueDate: addDays(today, -1),
        createdById: teacher.id,
        publishedAt: addDays(today, -5),
      },
      {
        classId: schoolClass.id,
        subjectId: bahasa!.id,
        title: 'Ringkasan cerpen',
        description: 'Satu halaman, tulis tangan.',
        dueDate: addDays(today, 3),
        createdById: teacher.id,
        publishedAt: addDays(today, -1),
      },
      {
        classId: schoolClass.id,
        subjectId: ipa!.id,
        title: 'Laporan praktikum',
        dueDate: addDays(today, 5),
        createdById: teacher.id,
        publishedAt: today,
      },
    ],
  });

  await prisma.examSchedule.createMany({
    data: [
      {
        classId: schoolClass.id,
        subjectId: matematika!.id,
        title: 'Ulangan harian Matematika',
        examDate: addDays(today, 2),
        startTime: '07:30',
        endTime: '09:00',
        room: 'Ruang 12',
        createdById: teacher.id,
        publishedAt: today,
        publishedById: teacher.id,
      },
      {
        classId: schoolClass.id,
        subjectId: ipa!.id,
        title: 'UTS IPA Terpadu',
        examDate: addDays(today, 7),
        startTime: '10:00',
        endTime: '11:30',
        room: 'Lab IPA',
        createdById: teacher.id,
      },
    ],
  });

  console.log('demo data ready');
  console.log(`  student : ${students[0]!.email} / ${PASSWORD}`);
  console.log(`  student : ${students[1]!.email} / ${PASSWORD}`);
  console.log(`  teacher : ${teacher.email} / ${PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
