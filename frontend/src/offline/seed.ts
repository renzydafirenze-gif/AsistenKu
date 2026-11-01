import type {
  Dashboard,
  Duty,
  Exam,
  Homework,
  Subject,
  UniformChecklist,
  User,
} from '../api/types';
import { addDaysKey, formatDateKey } from '../utils/format';

/**
 * Offline demo dataset. Dates are relative to the device's today, so the app
 * looks current whenever it is installed. Mirrors `backend/prisma/seed.ts` so
 * the offline and online experiences agree.
 *
 * ponytail: a bundled snapshot, not a synced replica. Replace with WatermelonDB
 * + /sync/push when offline edits must survive across devices.
 */
export interface OfflineDataset {
  user: User;
  duties: Duty[];
  homework: Homework[];
  exams: Exam[];
  subjects: Subject[];
  uniform: UniformChecklist;
}

const UNIFORM_ITEMS = [
  { key: 'shirt', label: 'Kemeja putih', category: 'Atasan' },
  { key: 'trousers', label: 'Celana abu-abu', category: 'Bawahan' },
  { key: 'tie', label: 'Dasi', category: 'Atribut' },
  { key: 'shoes', label: 'Sepatu hitam', category: 'Alas kaki' },
];

const SUBJECTS: Subject[] = [
  {
    id: 'subject-mtk',
    code: 'MTK',
    name: 'Matematika',
    teacher: { id: 'teacher-sari', fullName: 'Sari Wulandari', email: 'sari@sekolah.test' },
  },
  {
    id: 'subject-bin',
    code: 'BIN',
    name: 'Bahasa Indonesia',
    teacher: { id: 'teacher-sari', fullName: 'Sari Wulandari', email: 'sari@sekolah.test' },
  },
  {
    id: 'subject-ipa',
    code: 'IPA',
    name: 'IPA Terpadu',
    teacher: { id: 'teacher-sari', fullName: 'Sari Wulandari', email: 'sari@sekolah.test' },
  },
];

export function demoUniform(dateKey: string, checkedKeys: string[] = []): UniformChecklist {
  const items = UNIFORM_ITEMS.map((item) => ({
    ...item,
    checked: checkedKeys.includes(item.key),
    checkedAt: null,
  }));
  const completedCount = items.filter((item) => item.checked).length;
  return {
    date: dateKey,
    dayType: 'SCHOOL_DAY',
    note: null,
    items,
    completedCount,
    total: items.length,
    status:
      completedCount === 0 ? 'PENDING' : completedCount === items.length ? 'COMPLETE' : 'PARTIAL',
    badge:
      completedCount === items.length
        ? { label: 'Lengkap', color: '#27AE60' }
        : { label: `${completedCount}/${items.length}`, color: '#F39C12' },
  };
}

export function createDemoDataset(now: Date = new Date()): OfflineDataset {
  const todayKey = formatDateKey(now);
  const day = (offset: number) => addDaysKey(todayKey, offset);

  const duties: Duty[] = [
    {
      id: 'duty-yesterday',
      classId: 'class-x-ipa-1',
      className: 'X IPA 1',
      date: day(-1),
      shift: 'MORNING',
      assignedStudentId: 'student-ani',
      assignedStudentName: 'Ani Lestari',
      notes: 'Bersihkan papan tulis',
      completedAt: `${day(-1)}T01:00:00.000Z`,
      status: 'COMPLETED',
      canComplete: false,
    },
    {
      id: 'duty-today',
      classId: 'class-x-ipa-1',
      className: 'X IPA 1',
      date: todayKey,
      shift: 'MORNING',
      assignedStudentId: 'student-ani',
      assignedStudentName: 'Ani Lestari',
      notes: 'Sapu dan pel lantai',
      completedAt: null,
      status: 'TODAY',
      countdown: { days: 0, hours: 0, label: 'Hari ini', isPast: false },
      canComplete: true,
    },
    {
      id: 'duty-tomorrow',
      classId: 'class-x-ipa-1',
      className: 'X IPA 1',
      date: day(1),
      shift: 'AFTERNOON',
      assignedStudentId: 'student-beni',
      assignedStudentName: 'Beni Pratama',
      notes: null,
      completedAt: null,
      status: 'UPCOMING',
      countdown: { days: 1, hours: 24, label: 'H-1', isPast: false },
      canComplete: false,
    },
  ];

  const homework: Homework[] = [
    {
      id: 'hw-late',
      title: 'Latihan pecahan halaman 42',
      description: 'Kerjakan soal 1–10 di buku tulis.',
      dueDate: `${day(-1)}T17:00:00.000Z`,
      isOverdue: true,
      isLate: true,
      accentColor: '#C0392B',
      subject: { id: 'subject-mtk', name: 'Matematika', code: 'MTK' },
      assignment: { status: 'PENDING' },
    },
    {
      id: 'hw-upcoming',
      title: 'Ringkasan cerpen',
      description: 'Satu halaman, tulis tangan.',
      dueDate: `${day(3)}T17:00:00.000Z`,
      isOverdue: false,
      isLate: false,
      accentColor: '#2E86C1',
      subject: { id: 'subject-bin', name: 'Bahasa Indonesia', code: 'BIN' },
      assignment: { status: 'PENDING' },
    },
    {
      id: 'hw-ipa',
      title: 'Laporan praktikum',
      dueDate: `${day(5)}T17:00:00.000Z`,
      isOverdue: false,
      isLate: false,
      accentColor: '#2E86C1',
      subject: { id: 'subject-ipa', name: 'IPA Terpadu', code: 'IPA' },
      assignment: { status: 'PENDING' },
    },
  ];

  const exams: Exam[] = [
    {
      id: 'exam-mtk',
      title: 'Ulangan harian Matematika',
      examDate: day(2),
      startTime: '07:30',
      endTime: '09:00',
      room: 'Ruang 12',
      isPublished: true,
      isLocked: true,
      daysUntil: 2,
      subject: { id: 'subject-mtk', name: 'Matematika', code: 'MTK' },
    },
    {
      id: 'exam-ipa',
      title: 'UTS IPA Terpadu',
      examDate: day(7),
      startTime: '10:00',
      endTime: '11:30',
      room: 'Lab IPA',
      isPublished: false,
      isLocked: false,
      daysUntil: 7,
      subject: { id: 'subject-ipa', name: 'IPA Terpadu', code: 'IPA' },
    },
  ];

  return {
    user: {
      id: 'student-ani',
      email: 'ani@sekolah.test',
      fullName: 'Ani Lestari',
      role: 'STUDENT',
      classId: 'class-x-ipa-1',
    },
    duties,
    homework,
    exams,
    subjects: SUBJECTS,
    uniform: demoUniform(todayKey),
  };
}

/** Builds the same card payload the API returns, from local data only. */
export function buildOfflineDashboard(dataset: OfflineDataset, now: Date = new Date()): Dashboard {
  const todayKey = formatDateKey(now);
  const hour = now.getHours();
  const greeting =
    hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';

  const duty = dataset.duties.find((item) => item.date === todayKey) ?? null;
  const lateCount = dataset.homework.filter((item) => item.isLate).length;
  const pending = dataset.homework.filter((item) => item.assignment?.status !== 'SUBMITTED');
  const nextExam =
    [...dataset.exams].sort((a, b) => a.examDate.localeCompare(b.examDate))[0] ?? null;
  const uniform = dataset.uniform;

  return {
    date: todayKey,
    greeting,
    user: {
      id: dataset.user.id,
      fullName: dataset.user.fullName,
      role: dataset.user.role,
      classId: dataset.user.classId,
    },
    cards: [
      {
        key: 'duty',
        title: 'Piket',
        summary: duty
          ? `Hari ini · ${duty.shift === 'AFTERNOON' ? 'Siang' : 'Pagi'} · ${duty.assignedStudentName}`
          : 'Tidak ada piket hari ini',
        badge: duty
          ? { label: duty.completedAt ? 'Selesai' : 'Hari ini', color: duty.completedAt ? '#27AE60' : '#F39C12' }
          : { label: 'Kosong', color: '#7F8C8D' },
      },
      {
        key: 'uniform',
        title: 'Seragam',
        summary: `${uniform.completedCount}/${uniform.total} item lengkap`,
        badge: uniform.badge,
      },
      {
        key: 'homework',
        title: 'PR',
        summary:
          lateCount > 0
            ? `${pending.length} tugas belum selesai, ${lateCount} terlambat`
            : `${pending.length} tugas belum selesai`,
        badge: lateCount > 0 ? { label: 'Terlambat', color: '#C0392B' } : { label: 'Aman', color: '#27AE60' },
      },
      {
        key: 'exam',
        title: 'Ujian',
        summary: nextExam ? `${nextExam.subject?.name} · ${nextExam.examDate} ${nextExam.startTime}` : 'Belum ada ujian',
        badge: nextExam
          ? { label: nextExam.daysUntil === 0 ? 'Hari ini' : `H-${nextExam.daysUntil}`, color: '#F39C12' }
          : { label: '-', color: '#7F8C8D' },
      },
      {
        key: 'subjects',
        title: 'Mapel',
        summary: `${dataset.subjects.length} mata pelajaran`,
        badge: { label: 'Lihat', color: '#2E86C1' },
      },
    ],
    detail: {
      duty,
      uniform,
      homework: { pending, lateCount, upcomingCount: pending.length - lateCount },
      exam: nextExam,
      subjects: dataset.subjects,
    },
  };
}
