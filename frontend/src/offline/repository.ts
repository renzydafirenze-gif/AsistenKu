import type {
  Dashboard,
  Duty,
  DutyShift,
  Exam,
  Homework,
  Page,
  Subject,
  UniformChecklist,
} from '../api/types';
import { formatDateKey } from '../utils/format';
import {
  buildOfflineDashboard,
  createDemoDataset,
  createEmptyDataset,
  demoUniform,
  deriveDataset,
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

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

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
  return trimmed;
}

function subjectRef(name: string): Homework['subject'] {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const code = trimmed.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'MAP';
  return { id: `subject-${code.toLowerCase()}`, name: trimmed, code };
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

  uniformChecklist(date?: string): Promise<UniformChecklist>;
  toggleUniform(date: string, itemKey: string, checked: boolean): Promise<UniformChecklist>;

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

      const duty: Duty = {
        id: existing?.id ?? newId('duty'),
        classId: existing?.classId ?? 'kelas-saya',
        className: existing?.className,
        date,
        shift: input.shift,
        assignedStudentId: existing?.assignedStudentId ?? 'local-user',
        assignedStudentName: studentName,
        notes: input.notes.trim() || null,
        completedAt: existing?.completedAt ?? null,
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

      const homework: Homework = {
        id: existing?.id ?? newId('hw'),
        title,
        description: input.description.trim() || null,
        dueDate: `${dueDate}T17:00:00.000Z`,
        subject: subjectRef(input.subjectName),
        assignment: existing?.assignment ?? { status: 'PENDING' },
      };
      await storage.save({
        ...dataset,
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
      if (!TIME.test(input.startTime) || !TIME.test(input.endTime)) {
        throw new Error('Jam harus berformat HH:MM.');
      }
      const existing = id ? dataset.exams.find((item) => item.id === id) : undefined;
      if (existing?.isLocked) throw new Error('Ujian terpublikasi tidak bisa diubah.');
      if (id && !existing) throw new Error('Ujian tidak ditemukan.');

      const exam: Exam = {
        id: existing?.id ?? newId('exam'),
        title,
        examDate,
        startTime: input.startTime,
        endTime: input.endTime,
        room: input.room.trim() || null,
        subject: subjectRef(input.subjectName),
        isPublished: false,
        isLocked: false,
      };
      await storage.save({
        ...dataset,
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

    uniformChecklist: async (date?: string) => {
      const dataset = await load();
      // A stored checklist belongs to the day it was generated for.
      if (date && dataset.uniform.date !== date) return demoUniform(date);
      return dataset.uniform;
    },

    toggleUniform: async (date, itemKey, checked) => {
      const dataset = await load();
      const checkedKeys = dataset.uniform.items
        .filter((item) => (item.key === itemKey ? checked : item.checked))
        .map((item) => item.key);
      const checklist = demoUniform(date, checkedKeys);
      await storage.save({ ...dataset, uniform: checklist });
      return checklist;
    },

    updateProfile: async (fullName) => {
      const dataset = await load();
      const name = requireText(fullName, 'Nama');
      await storage.save({ ...dataset, user: { ...dataset.user, fullName: name } });
    },

    clearAll: async () => {
      await storage.save(createEmptyDataset());
    },

    loadDemo: async () => {
      await storage.save(createDemoDataset());
    },
  };
}

/** Default date used by the "add" forms: today. */
export const todayKey = (): string => formatDateKey(new Date());
