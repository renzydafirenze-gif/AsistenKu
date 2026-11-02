import type {
  Dashboard,
  Duty,
  Exam,
  Homework,
  Subject,
  UniformPlan,
  User,
} from '../api/types';
import { addDaysKey, daysBetween, formatDateKey } from '../utils/format';

/**
 * Local dataset. Everything the student sees is created by them on the device
 * and persisted in AsyncStorage; `createDemoDataset` is only the optional
 * example data reached from Pengaturan.
 */
export interface OfflineDataset {
  user: User;
  duties: Duty[];
  homework: Homework[];
  exams: Exam[];
  subjects: Subject[];
  uniformPlans: UniformPlan[];
}

/** Default week: the common Indonesian school rotation, editable by the user. */
export const DEFAULT_UNIFORM_PLANS: UniformPlan[] = [
  { id: 'uniform-mon', dayOfWeek: 1, label: 'Putih–Biru', detail: 'Kemeja putih, celana/rok biru, dasi' },
  { id: 'uniform-tue', dayOfWeek: 2, label: 'Batik', detail: null },
  { id: 'uniform-wed', dayOfWeek: 3, label: 'Pramuka', detail: 'Seragam cokelat lengkap' },
  { id: 'uniform-thu', dayOfWeek: 4, label: 'Batik', detail: null },
  { id: 'uniform-fri', dayOfWeek: 5, label: 'Olahraga', detail: 'Kaos olahraga, celana training' },
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

/** Fresh install: no schedules yet, only the profile placeholder. */
export function createEmptyDataset(): OfflineDataset {
  return {
    user: {
      id: 'local-user',
      email: '',
      fullName: 'Siswa',
      role: 'STUDENT',
      classId: null,
    },
    duties: [],
    homework: [],
    exams: [],
    subjects: [],
    uniformPlans: [],
  };
}

/**
 * Recomputes every date-relative field so stored rows never go stale: a duty
 * becomes TODAY on its day, homework turns late on its own, exams count down.
 */
export function deriveDataset(dataset: OfflineDataset, now: Date = new Date()): OfflineDataset {
  const today = formatDateKey(now);

  const duties = dataset.duties.map((duty): Duty => {
    const days = daysBetween(today, duty.date);
    return {
      ...duty,
      status: duty.completedAt ? 'COMPLETED' : days < 0 ? 'OVERDUE' : days === 0 ? 'TODAY' : 'UPCOMING',
      canComplete: !duty.completedAt && days <= 0,
      countdown: {
        days: Math.max(days, 0),
        hours: Math.max(days, 0) * 24,
        label: days <= 0 ? 'Hari ini' : `H-${days}`,
        isPast: days < 0,
      },
    };
  });

  const homework = dataset.homework.map((item): Homework => {
    const late = item.dueDate.slice(0, 10) < today;
    const submitted = item.assignment?.status === 'SUBMITTED';
    return { ...item, isLate: late, isOverdue: late && !submitted };
  });

  const exams = dataset.exams.map((exam): Exam => ({
    ...exam,
    daysUntil: daysBetween(today, exam.examDate),
  }));

  return { ...dataset, duties, homework, exams };
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
    uniformPlans: DEFAULT_UNIFORM_PLANS,
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
    [...dataset.exams]
      .sort((a, b) => a.examDate.localeCompare(b.examDate))
      .find((exam) => exam.examDate >= todayKey) ?? null;
  const uniform = dataset.uniformPlans.find((plan) => plan.dayOfWeek === now.getDay()) ?? null;

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
        summary: uniform ? `Hari ini: ${uniform.label}` : 'Belum diatur untuk hari ini',
        badge: uniform ? { label: 'Hari ini', color: '#2E86C1' } : { label: 'Kosong', color: '#7F8C8D' },
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
