import { createOfflineStorage } from '../src/offline/storage';
import { createDemoDataset } from '../src/offline/seed';
import { createStore } from '../src/store';
import {
  completeDuty,
  loadDashboard,
  loadDuties,
  loadExams,
  loadHomework,
  loadSubjects,
  loadUniform,
  resetData,
  toggleUniform,
} from '../src/store/dataSlice';

function memoryBackend() {
  const data = new Map<string, string>();
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

function makeStore() {
  return createStore({ offline: createOfflineStorage(memoryBackend()) });
}

describe('data slice (local)', () => {
  it('loads the dashboard from the bundled dataset', async () => {
    const store = makeStore();
    await store.dispatch(loadDashboard());

    const { dashboard } = store.getState().data;
    expect(dashboard.status).toBe('ready');
    expect(dashboard.data?.user.fullName).toBe('Ani Lestari');
    expect(dashboard.data?.cards).toHaveLength(5);
  });

  it('loads duties sorted by date', async () => {
    const store = makeStore();
    await store.dispatch(loadDuties());

    const duties = store.getState().data.duties;
    expect(duties.status).toBe('ready');
    expect(duties.data.map((duty) => duty.date)).toEqual([...duties.data.map((duty) => duty.date)].sort());
  });

  it('marks the today duty complete in place', async () => {
    const store = makeStore();
    await store.dispatch(loadDuties());
    const todayDuty = store.getState().data.duties.data.find((duty) => duty.status === 'TODAY')!;

    await store.dispatch(completeDuty(todayDuty.id));

    const updated = store.getState().data.duties.data.find((duty) => duty.id === todayDuty.id);
    expect(updated?.status).toBe('COMPLETED');
    expect(updated?.completedAt).toBeTruthy();
  });

  it('loads homework, exams, subjects and the uniform checklist', async () => {
    const store = makeStore();
    await store.dispatch(loadHomework());
    await store.dispatch(loadExams());
    await store.dispatch(loadSubjects());
    await store.dispatch(loadUniform(undefined));

    const { homework, exams, subjects, uniform } = store.getState().data;
    expect(homework.data.some((item) => item.isLate)).toBe(true);
    expect(exams.data).toHaveLength(2);
    expect(subjects.data).toHaveLength(3);
    expect(uniform.data?.total).toBe(4);
  });

  it('persists a uniform toggle in the store', async () => {
    const store = makeStore();
    await store.dispatch(loadUniform(undefined));
    const date = store.getState().data.uniform.data!.date;

    await store.dispatch(toggleUniform({ date, itemKey: 'shirt', checked: true }));

    const uniform = store.getState().data.uniform.data!;
    expect(uniform.completedCount).toBe(1);
    expect(uniform.items.find((item) => item.key === 'shirt')?.checked).toBe(true);
  });

  it('surfaces storage failures instead of blanking cached rows', async () => {
    const store = createStore({
      offline: {
        load: async () => {
          throw new Error('storage rusak');
        },
        save: async () => undefined,
        reset: async () => undefined,
      },
    });

    await store.dispatch(loadDashboard());

    expect(store.getState().data.dashboard.status).toBe('error');
    expect(store.getState().data.dashboard.error).toContain('storage rusak');
  });

  it('resets every resource', async () => {
    const store = makeStore();
    await store.dispatch(loadDuties());
    store.dispatch(resetData());

    expect(store.getState().data.duties.data).toHaveLength(0);
    expect(store.getState().data.duties.status).toBe('idle');
  });

  it('keeps the seeded dataset stable between stores', async () => {
    const backend = memoryBackend();
    const first = createStore({ offline: createOfflineStorage(backend) });
    await first.dispatch(loadDuties());
    const todayDuty = first.getState().data.duties.data.find((duty) => duty.status === 'TODAY')!;
    await first.dispatch(completeDuty(todayDuty.id));

    const second = createStore({ offline: createOfflineStorage(backend) });
    await second.dispatch(loadDuties());
    expect(second.getState().data.duties.data.find((duty) => duty.id === todayDuty.id)?.status).toBe(
      'COMPLETED',
    );

    // Guard against the seed mutating between calls.
    expect(createDemoDataset().duties.find((duty) => duty.id === todayDuty.id)?.status).toBe('TODAY');
  });
});
