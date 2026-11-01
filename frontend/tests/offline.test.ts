import { createRepository } from '../src/offline/repository';
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
  };
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

  it('recovers from a corrupt payload', async () => {
    const backend = memoryBackend();
    await backend.setItem('asistensiswa.dataset.v1', '{oops');

    const storage = createOfflineStorage(backend);
    expect((await storage.load()).user.email).toBe('ani@sekolah.test');
  });

  it('resets back to the bundled seed', async () => {
    const storage = createOfflineStorage(memoryBackend());
    const dataset = await storage.load();
    await storage.save({ ...dataset, duties: [] });
    await storage.reset();
    expect((await storage.load()).duties).toHaveLength(3);
  });
});

describe('local repository', () => {
  it('serves every screen from the bundled dataset', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));

    await expect(repository.dashboard()).resolves.toMatchObject({
      greeting: expect.stringMatching(/^Selamat (pagi|siang|sore|malam)$/),
    });
    await expect(repository.duties()).resolves.toMatchObject({ items: expect.any(Array) });
    await expect(repository.homework()).resolves.toMatchObject({ items: expect.any(Array) });
    await expect(repository.exams()).resolves.toMatchObject({ items: expect.any(Array) });
    await expect(repository.subjects()).resolves.toMatchObject({ items: expect.any(Array) });
    await expect(repository.uniformChecklist()).resolves.toMatchObject({ total: 4 });
  });

  it('persists duty completion across a reload', async () => {
    const backend = memoryBackend();
    const storage = createOfflineStorage(backend);
    const repository = createRepository(storage);
    const dataset = await storage.load();
    const todayDuty = dataset.duties.find((duty) => duty.status === 'TODAY')!;

    const result = await repository.completeDuty(todayDuty.id);
    expect(result.duty.status).toBe('COMPLETED');
    expect(result.toast.type).toBe('success');

    const reloaded = await createOfflineStorage(backend).load();
    expect(reloaded.duties.find((duty) => duty.id === todayDuty.id)?.status).toBe('COMPLETED');
  });

  it('reports an unknown duty without crashing', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));
    const result = await repository.completeDuty('missing');
    expect(result.toast.type).toBe('info');
  });

  it('persists uniform toggles and rebuilds the checklist', async () => {
    const storage = createOfflineStorage(memoryBackend());
    const repository = createRepository(storage);

    const first = await repository.toggleUniform(TODAY, 'shirt', true);
    expect(first.completedCount).toBe(1);
    expect(first.status).toBe('PARTIAL');

    const second = await repository.toggleUniform(TODAY, 'tie', true);
    expect(second.completedCount).toBe(2);
    expect(second.items.find((item) => item.key === 'shirt')?.checked).toBe(true);
  });

  it('returns an empty checklist for another day', async () => {
    const repository = createRepository(createOfflineStorage(memoryBackend()));
    const other = await repository.uniformChecklist(addDaysKey(TODAY, 1));
    expect(other.date).toBe(addDaysKey(TODAY, 1));
    expect(other.completedCount).toBe(0);
  });
});
