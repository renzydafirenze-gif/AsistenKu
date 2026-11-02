import type {
  Dashboard,
  Duty,
  DutyShift,
  Exam,
  Homework,
  Page,
  Subject,
  UniformPlan,
} from '../api/types';
import { formatDateKey } from '../utils/format';
import {
  buildOfflineDashboard,
  createDemoDataset,
  createEmptyDataset,
  deriveDataset,
  type OfflineDataset,
} from './seed';
import type { OfflineStorage } from './storage';

export interface DutyInput {
  date: string;
  shift: DutyShift;
  studentName: string;
  notes: string;
}

export interface HomeworkInput {
  title: string;
  subjectName: string;
  dueDate: string;
  description: string;
}

export interface ExamInput {
  title: string;
  subjectName: string;
  examDate: string;
  startTime: string;
  endTime: string;
  room: string;
}

export interface SubjectInput {
  name: string;
  code: string;
  teacherName: string;
  teacherEmail: string;
}

export interface UniformPlanInput {
  dayOfWeek: number;
  label: string;
  detail: string;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function requireText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} wajib diisi.`);
  return trimmed;
}

function requireDate(value: string, label: string): string {
  const trimmed = value.trim();
  if (!DATE_KEY.test(trimmed)) throw new Error(`${label} harus berformat YYYY-MM-DD.`);
  // Reject impossible calendar days such as 2026-02-31.
  const [year, month, day] = trimmed.split('-').map(Number) as [number, number, number];
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new Error(`${label} bukan tanggal yang valid.`);
  }
  return trimmed;
}

function requireTime(value: string, label: string): string {
  const trimmed = value.trim();
  if (!TIME.test(trimmed)) throw new Error(`${label} harus berformat HH:MM.`);
  return trimmed;
}

function codeFrom(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'MAP';
}

/**
 * Links a typed subject name to the mapel list, adding the mapel on first use.
 * Fabricating an id would leave the mapel list empty while PR/ujian still
 * showed a subject, and two names sharing three letters collided.
 */
function resolveSubject(
  dataset: OfflineDataset,
  name: string,
): { subject: Homework['subject']; subjects: Subject[] } {
  const trimmed = name.trim();
  if (!trimmed) return { subject: null, subjects: dataset.subjects };

  const existing = dataset.subjects.find(
    (item) => item.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (existing) {
    return {
      subject: { id: existing.id, name: existing.name, code: existing.code },
      subjects: dataset.subjects,
    };
  }

  const created: Subject = {
    id: newId('subject'),
    code: codeFrom(trimmed),
    name: trimmed,
    teacher: null,
  };
  return {
    subject: { id: created.id, name: created.name, code: created.code },
    subjects: [...dataset.subjects, created],
  };
}

/**
 * The only data source. Every read and write stays on the device: there is no
 * network path in the app.
 *
 * ponytail: one local dataset per install. Add export/import when data must
 * move between phones.
 */
export interface Repository {
  dashboard(): Promise<Dashboard>;
  duties(): Promise<Page<Duty>>;
  saveDuty(input: DutyInput, id?: string): Promise<Duty>;
  completeDuty(id: string): Promise<Duty>;
  removeDuty(id: string): Promise<void>;

  homework(): Promise<Page<Homework>>;
  saveHomework(input: HomeworkInput, id?: string): Promise<Homework>;
  completeHomework(id: string): Promise<Homework>;
  removeHomework(id: string): Promise<void>;

  exams(): Promise<Page<Exam>>;
  saveExam(input: ExamInput, id?: string): Promise<Exam>;
  publishExam(id: string): Promise<Exam>;
  removeExam(id: string): Promise<void>;

  subjects(): Promise<Page<Subject>>;
  saveSubject(input: SubjectInput, id?: string): Promise<Subject>;
  removeSubject(id: string): Promise<void>;

  uniformPlans(): Promise<UniformPlan[]>;
  saveUniformPlan(input: UniformPlanInput, id?: string): Promise<UniformPlan>;
  removeUniformPlan(id: string): Promise<void>;

  updateProfile(fullName: string): Promise<void>;
  /** Back to a clean slate (no example rows). */
  clearAll(): Promise<void>;
  /** Replaces local data with the bundled example dataset. */
  loadDemo(): Promise<void>;
}

export function createRepository(storage: OfflineStorage): Repository {
  const load = async () => deriveDataset(await storage.load());

  return {
    dashboard: async () => buildOfflineDashboard(await load()),

    duties: async () => {
      const dataset = await load();
      return { items: [...dataset.duties].sort((a, b) => a.date.localeCompare(b.date)) };
    },

    saveDuty: async (input, id) => {
      const dataset = await load();
      const date = requireDate(input.date, 'Tanggal');
      const studentName = requireText(input.studentName, 'Nama siswa');
      const existing = id ? dataset.duties.find((item) => item.id === id) : undefined;
      if (id && !existing) throw new Error('Jadwal piket tidak ditemukan.');
      // A rescheduled duty is not done yet; otherwise it would stay COMPLETED.
      const rescheduled = !!existing && existing.date !== date;

      const duty: Duty = {
        id: existing?.id ?? newId('duty'),
        classId: existing?.classId ?? 'kelas-saya',
        className: existing?.className,
        date,
        shift: input.shift,
        assignedStudentId: existing?.assignedStudentId ?? 'local-user',
        assignedStudentName: studentName,
        notes: input.notes.trim() || null,
        completedAt: rescheduled ? null : (existing?.completedAt ?? null),
      };
      await storage.save({
        ...dataset,
        duties: existing
          ? dataset.duties.map((item) => (item.id === duty.id ? duty : item))
          : [...dataset.duties, duty],
      });
      return deriveDataset(await storage.load()).duties.find((item) => item.id === duty.id)!;
    },

    completeDuty: async (id) => {
      const dataset = await load();
      const duty = dataset.duties.find((item) => item.id === id);
      if (!duty) throw new Error('Jadwal piket tidak ditemukan.');
      const completed: Duty = { ...duty, completedAt: new Date().toISOString() };
      await storage.save({
        ...dataset,
        duties: dataset.duties.map((item) => (item.id === id ? completed : item)),
      });
      return deriveDataset(await storage.load()).duties.find((item) => item.id === id)!;
    },

    removeDuty: async (id) => {
      const dataset = await load();
      await storage.save({ ...dataset, duties: dataset.duties.filter((item) => item.id !== id) });
    },

    homework: async () => {
      const dataset = await load();
      // Late work sorts first because its due date is furthest in the past.
      return { items: [...dataset.homework].sort((a, b) => a.dueDate.localeCompare(b.dueDate)) };
    },

    saveHomework: async (input, id) => {
      const dataset = await load();
      const title = requireText(input.title, 'Judul PR');
      const dueDate = requireDate(input.dueDate, 'Tenggat');
      const existing = id ? dataset.homework.find((item) => item.id === id) : undefined;
      if (id && !existing) throw new Error('PR tidak ditemukan.');
      const { subject, subjects } = resolveSubject(dataset, input.subjectName);

      const homework: Homework = {
        id: existing?.id ?? newId('hw'),
        title,
        description: input.description.trim() || null,
        dueDate: `${dueDate}T17:00:00.000Z`,
        subject,
        assignment: existing?.assignment ?? { status: 'PENDING' },
      };
      await storage.save({
        ...dataset,
        subjects,
        homework: existing
          ? dataset.homework.map((item) => (item.id === homework.id ? homework : item))
          : [...dataset.homework, homework],
      });
      return (await load()).homework.find((item) => item.id === homework.id)!;
    },

    completeHomework: async (id) => {
      const dataset = await load();
      const homework = dataset.homework.find((item) => item.id === id);
      if (!homework) throw new Error('PR tidak ditemukan.');
      const submitted: Homework = { ...homework, assignment: { status: 'SUBMITTED' } };
      await storage.save({
        ...dataset,
        homework: dataset.homework.map((item) => (item.id === id ? submitted : item)),
      });
      return deriveDataset(await storage.load()).homework.find((item) => item.id === id)!;
    },

    removeHomework: async (id) => {
      const dataset = await load();
      const homework = dataset.homework.find((item) => item.id === id);
      if (!homework) return;
      // Business rule: late work stays visible and cannot be deleted.
      if (homework.isLate) throw new Error('PR terlambat tidak bisa dihapus.');
      await storage.save({
        ...dataset,
        homework: dataset.homework.filter((item) => item.id !== id),
      });
    },

    exams: async () => {
      const dataset = await load();
      return { items: [...dataset.exams].sort((a, b) => a.examDate.localeCompare(b.examDate)) };
    },

    saveExam: async (input, id) => {
      const dataset = await load();
      const title = requireText(input.title, 'Judul ujian');
      const examDate = requireDate(input.examDate, 'Tanggal ujian');
      const startTime = requireTime(input.startTime, 'Jam mulai');
      const endTime = requireTime(input.endTime, 'Jam selesai');
      if (endTime <= startTime) throw new Error('Jam selesai harus setelah jam mulai.');
      const existing = id ? dataset.exams.find((item) => item.id === id) : undefined;
      if (existing?.isLocked) throw new Error('Ujian terpublikasi tidak bisa diubah.');
      if (id && !existing) throw new Error('Ujian tidak ditemukan.');
      const { subject, subjects } = resolveSubject(dataset, input.subjectName);

      const exam: Exam = {
        id: existing?.id ?? newId('exam'),
        title,
        examDate,
        startTime,
        endTime,
        room: input.room.trim() || null,
        subject,
        isPublished: false,
        isLocked: false,
      };
      await storage.save({
        ...dataset,
        subjects,
        exams: existing
          ? dataset.exams.map((item) => (item.id === exam.id ? exam : item))
          : [...dataset.exams, exam],
      });
      return (await load()).exams.find((item) => item.id === exam.id)!;
    },

    publishExam: async (id) => {
      const dataset = await load();
      const exam = dataset.exams.find((item) => item.id === id);
      if (!exam) throw new Error('Ujian tidak ditemukan.');
      // Publishing is one-way: exam schedules are immutable afterwards.
      const published: Exam = { ...exam, isPublished: true, isLocked: true };
      await storage.save({
        ...dataset,
        exams: dataset.exams.map((item) => (item.id === id ? published : item)),
      });
      return (await load()).exams.find((item) => item.id === id)!;
    },

    removeExam: async (id) => {
      const dataset = await load();
      const exam = dataset.exams.find((item) => item.id === id);
      if (!exam) return;
      if (exam.isLocked) throw new Error('Ujian terpublikasi tidak bisa dihapus.');
      await storage.save({ ...dataset, exams: dataset.exams.filter((item) => item.id !== id) });
    },

    subjects: async () => {
      const dataset = await load();
      return { items: [...dataset.subjects].sort((a, b) => a.name.localeCompare(b.name)) };
    },

    saveSubject: async (input, id) => {
      const dataset = await load();
      const name = requireText(input.name, 'Nama mapel');
      const code = requireText(input.code, 'Kode mapel').toUpperCase();
      const existing = id ? dataset.subjects.find((item) => item.id === id) : undefined;
      if (id && !existing) throw new Error('Mata pelajaran tidak ditemukan.');
      // Names identify mapel when linking PR/ujian, so they must stay unique.
      const clash = dataset.subjects.find(
        (item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase(),
      );
      if (clash) throw new Error('Mapel dengan nama itu sudah ada.');

      const teacherName = input.teacherName.trim();
      const subject: Subject = {
        id: existing?.id ?? newId('subject'),
        code,
        name,
        teacher: teacherName
          ? {
              id: existing?.teacher?.id ?? newId('teacher'),
              fullName: teacherName,
              email: input.teacherEmail.trim(),
            }
          : null,
      };
      await storage.save({
        ...dataset,
        subjects: existing
          ? dataset.subjects.map((item) => (item.id === subject.id ? subject : item))
          : [...dataset.subjects, subject],
      });
      return (await load()).subjects.find((item) => item.id === subject.id)!;
    },

    removeSubject: async (id) => {
      const dataset = await load();
      await storage.save({
        ...dataset,
        subjects: dataset.subjects.filter((item) => item.id !== id),
      });
    },

    uniformPlans: async () => {
      const dataset = await load();
      // Monday-first so the screen reads like a school week.
      return [...dataset.uniformPlans].sort(
        (a, b) => ((a.dayOfWeek + 6) % 7) - ((b.dayOfWeek + 6) % 7),
      );
    },

    saveUniformPlan: async (input, id) => {
      const dataset = await load();
      const label = requireText(input.label, 'Nama seragam');
      if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6) {
        throw new Error('Hari tidak valid.');
      }
      const existing = id ? dataset.uniformPlans.find((item) => item.id === id) : undefined;
      if (id && !existing) throw new Error('Jadwal seragam tidak ditemukan.');
      // One uniform per weekday keeps the reminder unambiguous.
      const clash = dataset.uniformPlans.find(
        (item) => item.id !== id && item.dayOfWeek === input.dayOfWeek,
      );
      if (clash) throw new Error('Hari itu sudah punya jadwal seragam.');

      const plan: UniformPlan = {
        id: existing?.id ?? newId('uniform'),
        dayOfWeek: input.dayOfWeek,
        label,
        detail: input.detail.trim() || null,
      };
      await storage.save({
        ...dataset,
        uniformPlans: existing
          ? dataset.uniformPlans.map((item) => (item.id === plan.id ? plan : item))
          : [...dataset.uniformPlans, plan],
      });
      return plan;
    },

    removeUniformPlan: async (id) => {
      const dataset = await load();
      await storage.save({
        ...dataset,
        uniformPlans: dataset.uniformPlans.filter((item) => item.id !== id),
      });
    },

    updateProfile: async (fullName) => {
      const dataset = await load();
      const name = requireText(fullName, 'Nama');
      await storage.save({ ...dataset, user: { ...dataset.user, fullName: name } });
    },

    clearAll: async () => {
      const dataset = await load();
      // The sheet only promises to clear records, so the name and the weekly
      // uniform plan stay (they are settings, not entries to re-type).
      await storage.save({
        ...createEmptyDataset(),
        user: dataset.user,
        uniformPlans: dataset.uniformPlans,
      });
    },

    loadDemo: async () => {
      await storage.save(createDemoDataset());
    },
  };
}

/** Default date used by the "add" forms: today. */
export const todayKey = (): string => formatDateKey(new Date());
