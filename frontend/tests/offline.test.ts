import { createRepository } from '../src/offline/repository';
import {
  buildOfflineDashboard,
  createDemoDataset,
  createEmptyDataset,
  DEFAULT_UNIFORM_PLANS,
  deriveDataset,
} from '../src/offline/seed';
import { createOfflineStorage, DATASET_KEY } from '../src/offline/storage';
import { addDaysKey, formatDateKey } from '../src/utils/format';

const NOW = new Date(2026, 10, 2, 9, 0, 0);
const TODAY = formatDateKey(NOW);

function memoryBackend() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: async (key: string) => {
      data.delete(key);
    },
  };
}

const dutyInput = (date = TODAY) => ({
  date,
  shift: 'MORNING' as const,
  studentName: 'Ani',
  notes: '',
});

describe('local dataset', () => {
  it('starts empty on a fresh install', async () => {
    const dataset = await createOfflineStorage(memoryBackend()).load();
    expect(dataset.duties).toEqual([]);
    expect(dataset.homework).toEqual([]);
    expect(dataset.exams).toEqual([]);
    expect(dataset.subjects).toEqual([]);
    expect(dataset.user.fullName).toBe('Siswa');
    expect(dataset.uniformPlans).toEqual([]);
  });

  it('keeps example data behind an explicit action', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));
    await repository.loadDemo();

    expect((await repository.duties()).items).toHaveLength(3);
    expect((await repository.subjects()).items).toHaveLength(3);
    expect((await repository.homework()).items.some((item) => item.isLate)).toBe(true);
  });

  it('derives statuses from dates instead of stored flags', () => {
    const derived = deriveDataset(
      {
        ...createEmptyDataset(),
        duties: [
          {
            id: 'a',
            classId: 'k',
            date: addDaysKey(TODAY, -1),
            shift: 'MORNING',
            assignedStudentId: 's',
            status: 'TODAY',
          },
          {
            id: 'b',
            classId: 'k',
            date: TODAY,
            shift: 'AFTERNOON',
            assignedStudentId: 's',
          },
        ],
      },
      NOW,
    );

    expect(derived.duties[0]?.status).toBe('OVERDUE');
    expect(derived.duties[0]?.canComplete).toBe(true);
    expect(derived.duties[1]?.status).toBe('TODAY');
  });

  it('builds dashboard cards from local data', () => {
    const dashboard = buildOfflineDashboard(deriveDataset(createDemoDataset(NOW), NOW), NOW);
    const byKey = new Map(dashboard.cards.map((card) => [card.key, card]));

    expect(dashboard.greeting).toBe('Selamat pagi');
    expect(byKey.get('duty')?.badge).toEqual({ label: 'Hari ini', color: '#F39C12' });
    expect(byKey.get('homework')?.badge).toEqual({ label: 'Terlambat', color: '#C0392B' });
    expect(byKey.get('subjects')?.summary).toBe('3 mata pelajaran');
  });
});

describe('offline storage', () => {
  it('seeds once and reuses the persisted dataset', async () => {
    const backend = memoryBackend();
    const first = createOfflineStorage(backend);
    const seeded = await first.load();
    await first.save({ ...seeded, uniformPlans: DEFAULT_UNIFORM_PLANS });

    const second = createOfflineStorage(backend);
    expect((await second.load()).uniformPlans).toHaveLength(5);
  });

  it('recovers from a corrupt payload', async () => {
    const backend = memoryBackend();
    await backend.setItem(DATASET_KEY, '{oops');

    const storage = createOfflineStorage(backend);
    expect((await storage.load()).duties).toEqual([]);
  });

  it('rejects payloads that do not look like a dataset', async () => {
    const backend = memoryBackend();
    await backend.setItem(DATASET_KEY, JSON.stringify({ user: { fullName: 'Ani' } }));

    const dataset = await createOfflineStorage(backend).load();
    expect(dataset.duties).toEqual([]);
    expect(dataset.uniformPlans).toEqual([]);
  });

  it('migrates a payload that still has the old uniform checklist', async () => {
    const backend = memoryBackend();
    const legacy: Record<string, unknown> = { ...createEmptyDataset(), uniform: { items: [] } };
    delete legacy.uniformPlans;
    await backend.setItem(DATASET_KEY, JSON.stringify(legacy));

    const loaded = await createOfflineStorage(backend).load();
    expect(loaded.uniformPlans).toEqual([]);
    expect(loaded.user.fullName).toBe('Siswa');
  });
});

describe('duty CRUD', () => {
  it('creates, completes and deletes a duty', async () => {
    const backend = memoryBackend();
    const repository = createRepository(createOfflineStorage(backend));

    const duty = await repository.saveDuty(dutyInput());
    expect(duty.status).toBe('TODAY');
    expect(duty.canComplete).toBe(true);

    const completed = await repository.completeDuty(duty.id);
    expect(completed.status).toBe('COMPLETED');
    expect(completed.canComplete).toBe(false);

    // Survives a reload from disk.
    const reloaded = createRepository(createOfflineStorage(backend));
    expect((await reloaded.duties()).items[0]?.status).toBe('COMPLETED');

    await reloaded.removeDuty(duty.id);
    expect((await reloaded.duties()).items).toEqual([]);
  });

  it('rejects missing fields and bad dates', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));
    await expect(repository.saveDuty({ ...dutyInput(), studentName: '  ' })).rejects.toThrow(
      'Nama siswa wajib diisi.',
    );
    await expect(repository.saveDuty({ ...dutyInput(), date: '01-11-2026' })).rejects.toThrow(
      'Tanggal harus berformat YYYY-MM-DD.',
    );
    await expect(repository.saveDuty({ ...dutyInput(), date: '2026-02-31' })).rejects.toThrow(
      'Tanggal bukan tanggal yang valid.',
    );
  });

  it('clears the completion mark when a finished duty is rescheduled', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));
    const duty = await repository.saveDuty(dutyInput());
    await repository.completeDuty(duty.id);

    const moved = await repository.saveDuty(dutyInput(addDaysKey(TODAY, 2)), duty.id);
    expect(moved.completedAt).toBeNull();
    expect(moved.status).toBe('UPCOMING');
  });
});

describe('homework CRUD', () => {
  const input = (dueDate = TODAY) => ({
    title: 'Latihan',
    subjectName: 'Matematika',
    dueDate,
    description: '',
  });

  it('submits work and keeps late work undeletable', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));
    const late = await repository.saveHomework(input(addDaysKey(TODAY, -2)));
    expect(late.isLate).toBe(true);
    expect(late.subject?.code).toBe('MAT');

    const submitted = await repository.completeHomework(late.id);
    expect(submitted.assignment?.status).toBe('SUBMITTED');
    expect(submitted.isOverdue).toBe(false);

    await expect(repository.removeHomework(late.id)).rejects.toThrow('PR terlambat tidak bisa dihapus.');
  });

  it('deletes work that is still on time', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));
    const homework = await repository.saveHomework(input(addDaysKey(TODAY, 3)));
    await repository.removeHomework(homework.id);
    expect((await repository.homework()).items).toEqual([]);
  });

  it('rejects an empty title', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));
    await expect(repository.saveHomework(input())).resolves.toBeTruthy();
    await expect(repository.saveHomework({ ...input(), title: '' })).rejects.toThrow(
      'Judul PR wajib diisi.',
    );
  });
});

describe('exam CRUD', () => {
  const input = {
    title: 'Ulangan',
    subjectName: 'IPA',
    examDate: TODAY,
    startTime: '07:30',
    endTime: '09:00',
    room: 'R12',
  };

  it('locks a published exam against edits and deletes', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));
    const exam = await repository.saveExam(input);
    expect(exam.isLocked).toBe(false);

    const published = await repository.publishExam(exam.id);
    expect(published.isLocked).toBe(true);

    await expect(repository.saveExam(input, exam.id)).rejects.toThrow(
      'Ujian terpublikasi tidak bisa diubah.',
    );
    await expect(repository.removeExam(exam.id)).rejects.toThrow(
      'Ujian terpublikasi tidak bisa dihapus.',
    );
  });

  it('still removes drafts and validates times', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));
    const exam = await repository.saveExam(input);
    await repository.removeExam(exam.id);
    expect((await repository.exams()).items).toEqual([]);

    await expect(repository.saveExam({ ...input, startTime: '7:30' })).rejects.toThrow(
      'Jam mulai harus berformat HH:MM.',
    );
    await expect(repository.saveExam({ ...input, startTime: '25:00' })).rejects.toThrow(
      'Jam mulai harus berformat HH:MM.',
    );
    await expect(repository.saveExam({ ...input, startTime: '10:00', endTime: '09:00' })).rejects.toThrow(
      'Jam selesai harus setelah jam mulai.',
    );
  });
});

describe('subjects and profile', () => {
  it('creates, edits and removes a subject', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));
    const created = await repository.saveSubject(
      { name: 'Matematika', code: 'mtk', teacherName: 'Bu Sari', teacherEmail: 'sari@sekolah.id' },
    );
    expect(created.code).toBe('MTK');
    expect(created.teacher?.fullName).toBe('Bu Sari');

    const updated = await repository.saveSubject(
      { name: 'Matematika Lanjut', code: 'MTK', teacherName: '', teacherEmail: '' },
      created.id,
    );
    expect(updated.name).toBe('Matematika Lanjut');
    expect(updated.teacher).toBeNull();

    await repository.removeSubject(created.id);
    expect((await repository.subjects()).items).toEqual([]);
  });

  it('renames the student and clears every schedule but the name', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));
    await repository.saveSubject({ name: 'IPA', code: 'IPA', teacherName: '', teacherEmail: '' });
    await repository.saveDuty(dutyInput());
    await repository.updateProfile('  Budi  ');

    expect((await repository.dashboard()).user.fullName).toBe('Budi');

    await repository.clearAll();
    expect((await repository.subjects()).items).toEqual([]);
    expect((await repository.duties()).items).toEqual([]);
    // "Kosongkan" only promises to drop schedules, so the profile survives.
    expect((await repository.dashboard()).user.fullName).toBe('Budi');
  });

  it('refuses two mapel with the same name', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));
    await repository.saveSubject({ name: 'Matematika', code: 'MTK', teacherName: '', teacherEmail: '' });

    await expect(
      repository.saveSubject({ name: ' matematika ', code: 'MTK2', teacherName: '', teacherEmail: '' }),
    ).rejects.toThrow('Mapel dengan nama itu sudah ada.');
    expect((await repository.subjects()).items).toHaveLength(1);
  });
});

describe('subject linking', () => {
  it('adds the typed mapel once and reuses it for PR and ujian', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));

    const homework = await repository.saveHomework({
      title: 'Latihan',
      subjectName: 'Matematika',
      dueDate: TODAY,
      description: '',
    });
    const exam = await repository.saveExam({
      title: 'Ulangan',
      subjectName: 'matematika',
      examDate: TODAY,
      startTime: '07:30',
      endTime: '09:00',
      room: '',
    });

    const subjects = (await repository.subjects()).items;
    expect(subjects).toHaveLength(1);
    expect(subjects[0]?.name).toBe('Matematika');
    // Same record on both sides, so counts and names agree everywhere.
    expect(homework.subject?.id).toBe(subjects[0]?.id);
    expect(exam.subject?.id).toBe(subjects[0]?.id);
  });

  it('does not merge mapel that merely share a prefix', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));
    const first = await repository.saveHomework({
      title: 'A',
      subjectName: 'Matematika',
      dueDate: TODAY,
      description: '',
    });
    const second = await repository.saveHomework({
      title: 'B',
      subjectName: 'Matematika Wajib',
      dueDate: TODAY,
      description: '',
    });

    expect((await repository.subjects()).items).toHaveLength(2);
    expect(first.subject?.id).not.toBe(second.subject?.id);
  });
});

describe('uniform plan', () => {
  const plan = (dayOfWeek: number, label: string) => ({ dayOfWeek, label, detail: '' });

  it('creates, edits and deletes a weekly uniform', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));

    const monday = await repository.saveUniformPlan(plan(1, 'Putih–Biru'));
    expect(monday.label).toBe('Putih–Biru');
    expect((await repository.uniformPlans())).toHaveLength(1);

    const edited = await repository.saveUniformPlan(plan(2, 'Batik'), monday.id);
    expect(edited.dayOfWeek).toBe(2);
    expect((await repository.uniformPlans())[0]?.label).toBe('Batik');

    await repository.removeUniformPlan(monday.id);
    expect(await repository.uniformPlans()).toEqual([]);
  });

  it('rejects a second uniform on the same weekday', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));
    await repository.saveUniformPlan(plan(3, 'Pramuka'));

    await expect(repository.saveUniformPlan(plan(3, 'Batik'))).rejects.toThrow(
      'Hari itu sudah punya jadwal seragam.',
    );
  });

  it('requires a uniform name and a valid weekday', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));

    await expect(repository.saveUniformPlan(plan(1, '   '))).rejects.toThrow('Nama seragam wajib diisi.');
    await expect(repository.saveUniformPlan(plan(7, 'Batik'))).rejects.toThrow('Hari tidak valid.');
  });

  it('shows today’s uniform on the dashboard', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));
    await repository.saveUniformPlan(plan(NOW.getDay(), 'Batik'));

    const dashboard = await repository.dashboard();
    expect(dashboard.cards.find((card) => card.key === 'uniform')?.summary).toBe('Hari ini: Batik');
    expect(dashboard.detail?.uniform?.label).toBe('Batik');
  });

  it('keeps the weekly plan when clearing records', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));
    await repository.saveUniformPlan(plan(1, 'Putih–Biru'));

    await repository.clearAll();
    expect(await repository.uniformPlans()).toHaveLength(1);
  });
});
