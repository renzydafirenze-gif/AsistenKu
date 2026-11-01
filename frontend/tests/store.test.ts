import { createDemoDataset } from '../src/offline/seed';
import { formatDateKey } from '../src/utils/format';
import { createOfflineStorage, DATASET_KEY } from '../src/offline/storage';
import { createStore } from '../src/store';
import {
  clearAll,
  completeDuty,
  completeHomework,
  loadDemo,
  publishExam,
  refreshAll,
  removeSubject,
  saveDuty,
  saveExam,
  saveHomework,
  saveSubject,
  toggleUniform,
  updateProfile,
} from '../src/store/dataSlice';

function memoryBackend(initial?: Record<string, string>) {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: async (key: string) => {
      data.delete(key);
    },
  };
}

function makeStore(demo = false) {
  const backend = memoryBackend(
    demo ? { [DATASET_KEY]: JSON.stringify(createDemoDataset()) } : undefined,
  );
  return createStore({ offline: createOfflineStorage(backend) });
}

const dutyInput = {
  date: formatDateKey(new Date()),
  shift: 'MORNING' as const,
  studentName: 'Ani',
  notes: 'Sapu',
};

describe('data slice (local)', () => {
  it('loads an empty dashboard on a fresh install', async () => {
    const store = makeStore();
    await store.dispatch(refreshAll());

    const { dashboard, duties, subjects } = store.getState().data;
    expect(dashboard.status).toBe('ready');
    expect(dashboard.data?.user.fullName).toBe('Siswa');
    expect(duties.data).toEqual([]);
    expect(subjects.data).toEqual([]);
  });

  it('reloads every resource after loading the example data', async () => {
    const store = makeStore();
    await store.dispatch(loadDemo());

    const { dashboard, duties, exams, subjects, homework } = store.getState().data;
    expect(dashboard.data?.cards).toHaveLength(5);
    expect(duties.data).toHaveLength(3);
    expect(exams.data).toHaveLength(2);
    expect(subjects.data).toHaveLength(3);
    expect(homework.data.some((item) => item.isLate)).toBe(true);
  });

  it('adds a duty and reflects it on the dashboard', async () => {
    const store = makeStore();
    await store.dispatch(saveDuty({ input: dutyInput }));

    const { duties, dashboard } = store.getState().data;
    expect(duties.data).toHaveLength(1);
    expect(duties.data[0]?.status).toBe('TODAY');
    expect(dashboard.data?.cards.find((card) => card.key === 'duty')?.badge?.label).toBe('Hari ini');
  });

  it('completes a duty in place', async () => {
    const store = makeStore();
    await store.dispatch(saveDuty({ input: dutyInput }));
    const id = store.getState().data.duties.data[0]!.id;

    await store.dispatch(completeDuty(id));

    expect(store.getState().data.duties.data[0]?.status).toBe('COMPLETED');
  });

  it('saves and submits homework', async () => {
    const store = makeStore();
    await store.dispatch(
      saveHomework({
        input: { title: 'PR', subjectName: 'IPA', dueDate: dutyInput.date, description: '' },
      }),
    );
    const id = store.getState().data.homework.data[0]!.id;
    await store.dispatch(completeHomework(id));

    expect(store.getState().data.homework.data[0]?.assignment?.status).toBe('SUBMITTED');
  });

  it('publishes an exam and locks it', async () => {
    const store = makeStore();
    await store.dispatch(
      saveExam({
        input: {
          title: 'UTS',
          subjectName: 'IPA',
          examDate: dutyInput.date,
          startTime: '07:30',
          endTime: '09:00',
          room: '',
        },
      }),
    );
    const id = store.getState().data.exams.data[0]!.id;
    await store.dispatch(publishExam(id));

    expect(store.getState().data.exams.data[0]?.isLocked).toBe(true);
  });

  it('manages subjects and removes them', async () => {
    const store = makeStore();
    await store.dispatch(
      saveSubject({ input: { name: 'IPA', code: 'IPA', teacherName: '', teacherEmail: '' } }),
    );
    const id = store.getState().data.subjects.data[0]!.id;
    expect(store.getState().data.dashboard.data?.cards.find((card) => card.key === 'subjects')?.summary).toBe(
      '1 mata pelajaran',
    );

    await store.dispatch(removeSubject(id));
    expect(store.getState().data.subjects.data).toEqual([]);
  });

  it('renames the profile and clears data', async () => {
    const store = makeStore(true);
    await store.dispatch(updateProfile('Budi'));
    expect(store.getState().data.dashboard.data?.user.fullName).toBe('Budi');

    await store.dispatch(clearAll());
    expect(store.getState().data.duties.data).toEqual([]);
    expect(store.getState().data.dashboard.data?.user.fullName).toBe('Siswa');
  });

  it('persists a uniform toggle', async () => {
    const store = makeStore();
    await store.dispatch(refreshAll());
    const date = store.getState().data.uniform.data!.date;

    await store.dispatch(toggleUniform({ date, itemKey: 'shirt', checked: true }));

    const uniform = store.getState().data.uniform.data!;
    expect(uniform.completedCount).toBe(1);
    expect(uniform.items.find((item) => item.key === 'shirt')?.checked).toBe(true);
  });

  it('surfaces storage failures instead of blanking rows', async () => {
    const store = createStore({
      offline: {
        load: async () => {
          throw new Error('storage rusak');
        },
        save: async () => undefined,
        reset: async () => undefined,
      },
    });

    await store.dispatch(refreshAll());

    expect(store.getState().data.dashboard.status).toBe('error');
    expect(store.getState().data.dashboard.error).toContain('storage rusak');
  });
});
