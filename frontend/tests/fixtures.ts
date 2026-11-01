import type {
  AuthResult,
  Dashboard,
  Duty,
  Exam,
  Homework,
  Subject,
  UniformChecklist,
  User,
} from '../src/api/types';

export const student: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ani@sekolah.test',
  fullName: 'Ani Lestari',
  role: 'STUDENT',
  classId: '22222222-2222-4222-8222-222222222222',
};

export const authResult: AuthResult = {
  user: student,
  tokens: { accessToken: 'access-1', refreshToken: 'refresh-1' },
};

export const duty: Duty = {
  id: '33333333-3333-4333-8333-333333333333',
  classId: '22222222-2222-4222-8222-222222222222',
  date: '2026-10-31',
  shift: 'MORNING',
  assignedStudentId: student.id,
  assignedStudentName: 'Ani Lestari',
  status: 'TODAY',
  canComplete: true,
  countdown: { days: 0, hours: 3, label: 'Hari ini', isPast: false },
};

export const homework: Homework = {
  id: '44444444-4444-4444-8444-444444444444',
  title: 'Latihan pecahan',
  description: 'Kerjakan halaman 42',
  dueDate: '2026-10-29T17:00:00.000Z',
  isLate: true,
  accentColor: '#C0392B',
  subject: { id: '55555555-5555-4555-8555-555555555555', name: 'Matematika', code: 'MTK' },
};

export const exam: Exam = {
  id: '66666666-6666-4666-8666-666666666666',
  title: 'UTS Matematika',
  examDate: '2026-11-02',
  startTime: '07:30',
  endTime: '09:00',
  room: 'Lab 2',
  isPublished: true,
  isLocked: true,
  daysUntil: 2,
  subject: { id: '55555555-5555-4555-8555-555555555555', name: 'Matematika', code: 'MTK' },
};

export const uniform: UniformChecklist = {
  date: '2026-10-31',
  dayType: 'REGULAR',
  items: [
    { key: 'shirt', label: 'Kemeja putih', category: 'Atasan', checked: true },
    { key: 'tie', label: 'Dasi', category: 'Atribut', checked: false },
  ],
  completedCount: 1,
  total: 2,
  status: 'PARTIAL',
  badge: { label: '1 dari 2', color: '#F39C12' },
};

export const subject: Subject = {
  id: '55555555-5555-4555-8555-555555555555',
  code: 'MTK',
  name: 'Matematika',
  teacher: {
    id: '77777777-7777-4777-8777-777777777777',
    fullName: 'Bu Sari',
    email: 'sari@sekolah.test',
  },
};

export const dashboard: Dashboard = {
  date: '2026-10-31',
  greeting: 'Selamat pagi',
  user: {
    id: student.id,
    fullName: student.fullName,
    role: student.role,
    classId: student.classId ?? null,
  },
  cards: [
    {
      key: 'duty',
      title: 'Piket hari ini',
      summary: 'Shift pagi',
      badge: { label: 'Hari ini', color: '#F39C12' },
    },
    {
      key: 'uniform',
      title: 'Seragam',
      summary: '1 dari 2 item',
      badge: { label: 'Sebagian', color: '#F39C12' },
    },
    {
      key: 'homework',
      title: 'PR',
      summary: '1 terlambat',
      badge: { label: '1 terlambat', color: '#C0392B' },
    },
    {
      key: 'exam',
      title: 'Ujian',
      summary: 'UTS Matematika',
      badge: { label: 'H-2', color: '#F39C12' },
    },
    { key: 'subjects', title: 'Mapel', summary: '8 mata pelajaran' },
  ],
  detail: {
    duty,
    uniform,
    homework: { pending: [homework], lateCount: 1, upcomingCount: 0 },
    exam,
    subjects: [subject],
  },
};
