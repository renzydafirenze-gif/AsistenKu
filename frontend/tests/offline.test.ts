import { ApiError, type Api } from '../src/api/client';
import { createRepository, isOfflineError } from '../src/offline/repository';
import { buildOfflineDashboard, createDemoDataset } from '../src/offline/seed';
import { createOfflineStorage } from '../src/offline/storage';
import { addDaysKey, formatDateKey } from '../src/utils/format';

const NOW = new Date(2026, 10, 1, 9, 0, 0);
const TODAY = formatDateKey(NOW);

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
    size: () => data.size,
  };
}

function offlineApi(): Api {
  const fail = () => Promise.reject(new TypeError('Network request failed'));
  return {
    request: fail,
    login: fail,
    register: fail,
    me: fail,
    logout: fail,
    dashboard: fail,
    duties: fail,
    completeDuty: fail,
    homework: fail,
    exams: fail,
    subjects: fail,
    uniformChecklist: fail,
    toggleUniform: fail,
  } as Api;
}

describe('offline dataset', () => {
  it('builds relative dates so the demo always looks current', () => {
    const dataset = createDemoDataset(NOW);
    expect(dataset.duties.map((duty) => duty.date)).toEqual([
      addDaysKey(TODAY, -1),
      TODAY,
      addDaysKey(TODAY, 1),
    ]);
    expect(dataset.duties[1]?.status).toBe('TODAY');
    expect(dataset.homework.filter((item) => item.isLate)).toHaveLength(1);
    expect(dataset.uniform.total).toBe(4);
  });

  it('derives dashboard cards with the shared colour coding', () => {
    const dashboard = buildOfflineDashboard(createDemoDataset(NOW), NOW);
    const byKey = new Map(dashboard.cards.map((card) => [card.key, card]));

    expect(dashboard.greeting).toBe('Selamat pagi');
    expect(byKey.get('duty')?.badge).toEqual({ label: 'Hari ini', color: '#F39C12' });
    expect(byKey.get('homework')?.badge).toEqual({ label: 'Terlambat', color: '#C0392B' });
    expect(byKey.get('exam')?.summary).toContain('Matematika');
    expect(dashboard.detail?.homework?.lateCount).toBe(1);
    expect(dashboard.detail?.subjects).toHaveLength(3);
  });
});

describe('offline storage', () => {
  it('seeds once and reuses the persisted dataset', async () => {
    const backend = memoryBackend();
    const first = createOfflineStorage(backend);
    const seeded = await first.load();
    await first.save({ ...seeded, uniform: { ...seeded.uniform, completedCount: 2 } });

    const second = createOfflineStorage(backend);
    expect((await second.load()).uniform.completedCount).toBe(2);
  });

  it('recovers from corrupt payloads', async () => {
    const backend = memoryBackend();
    await backend.setItem('asistensiswa.offline.dataset.v1', '{oops');
    await backend.setItem('asistensiswa.offline.user.v1', 'nope');

    const storage = createOfflineStorage(backend);
    expect((await storage.load()).user.email).toBe('ani@sekolah.test');
    expect(await storage.user()).toBeNull();
  });

  it('remembers and clears the offline user', async () => {
    const storage = createOfflineStorage(memoryBackend());
    const dataset = await storage.load();
    await storage.setUser(dataset.user);
    expect((await storage.user())?.fullName).toBe('Ani Lestari');

    await storage.clearUser();
    expect(await storage.user()).toBeNull();
  });
});

describe('offline repository', () => {
  it('classifies transport failures, not server errors', () => {
    expect(isOfflineError(new TypeError('Network request failed'))).toBe(true);
    expect(isOfflineError(new Error('network request failed'))).toBe(true);
    expect(isOfflineError(new ApiError(401, 'UNAUTHORIZED', 'nope'))).toBe(false);
    expect(isOfflineError(new ApiError(500, 'INTERNAL', 'boom'))).toBe(false);
  });

  it('falls back to bundled data when the API is unreachable', async () => {
    const repository = createRepository({ api: offlineApi(), storage: createOfflineStorage(memoryBackend()) });

    await expect(repository.dashboard()).resolves.toMatchObject({
      greeting: expect.stringMatching(/^Selamat (pagi|siang|sore|malam)$/),
    });
    await expect(repository.duties()).resolves.toMatchObject({ items: expect.any(Array) });
    await expect(repository.homework()).resolves.toMatchObject({ items: expect.any(Array) });
    await expect(repository.exams()).resolves.toMatchObject({ items: expect.any(Array) });
    await expect(repository.subjects()).resolves.toMatchObject({ items: expect.any(Array) });
    await expect(repository.uniformChecklist()).resolves.toMatchObject({ total: 4 });
  });

  it('persists offline duty completion', async () => {
    const backend = memoryBackend();
    const storage = createOfflineStorage(backend);
    const repository = createRepository({ api: offlineApi(), storage });
    const dataset = await storage.load();
    const todayDuty = dataset.duties.find((duty) => duty.status === 'TODAY')!;

    const result = await repository.completeDuty(todayDuty.id);
    expect(result.duty.status).toBe('COMPLETED');
    expect(result.toast.type).toBe('success');

    const reloaded = await createOfflineStorage(backend).load();
    expect(reloaded.duties.find((duty) => duty.id === todayDuty.id)?.status).toBe('COMPLETED');
  });

  it('persists uniform toggles and rebuilds the checklist', async () => {
    const storage = createOfflineStorage(memoryBackend());
    const repository = createRepository({ api: offlineApi(), storage });

    const first = await repository.toggleUniform(TODAY, 'shirt', true);
    expect(first.completedCount).toBe(1);
    expect(first.status).toBe('PARTIAL');

    const second = await repository.toggleUniform(TODAY, 'tie', true);
    expect(second.completedCount).toBe(2);
    expect(second.items.find((item) => item.key === 'shirt')?.checked).toBe(true);
  });

  it('does not hide real server errors', async () => {
    const api = { ...offlineApi(), duties: () => Promise.reject(new ApiError(403, 'FORBIDDEN', 'no')) } as Api;
    const repository = createRepository({ api, storage: createOfflineStorage(memoryBackend()) });

    await expect(repository.duties()).rejects.toMatchObject({ status: 403 });
  });
});
