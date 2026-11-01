import { ApiError, type Api } from '../api/client';
import type {
  Duty,
  Exam,
  Homework,
  Page,
  Subject,
  UniformChecklist,
} from '../api/types';
import { buildOfflineDashboard, demoUniform } from './seed';
import type { OfflineStorage } from './storage';

/**
 * Local-first data source. Read paths try the API and fall back to the bundled
 * dataset when the device is offline; mutations are applied locally and
 * persisted so the demo stays consistent after a restart.
 *
 * ponytail: writes are not queued for the server. Add a change log and replay it
 * through /sync/push when offline edits must reach other devices.
 */
export type Repository = Pick<
  Api,
  | 'dashboard'
  | 'duties'
  | 'completeDuty'
  | 'homework'
  | 'exams'
  | 'subjects'
  | 'uniformChecklist'
  | 'toggleUniform'
>;

/** A fetch that never reached the server (DNS, no route, airplane mode). */
export function isOfflineError(error: unknown): boolean {
  if (error instanceof ApiError) return false;
  return error instanceof TypeError || (error instanceof Error && /network request failed/i.test(error.message));
}

export function createRepository(options: { api: Api; storage: OfflineStorage }): Repository {
  const { api, storage } = options;

  async function read<T>(remote: () => Promise<T>, local: () => Promise<T>): Promise<T> {
    try {
      return await remote();
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      return local();
    }
  }

  return {
    dashboard: () =>
      read(
        () => api.dashboard(),
        async () => buildOfflineDashboard(await storage.load()),
      ),

    duties: () =>
      read(
        () => api.duties({ limit: '50' }),
        async () => {
          const dataset = await storage.load();
          const items = [...dataset.duties].sort((a, b) => a.date.localeCompare(b.date));
          return { items } satisfies Page<Duty>;
        },
      ),

    completeDuty: (id: string) =>
      read(
        () => api.completeDuty(id),
        async () => {
          const dataset = await storage.load();
          const duty = dataset.duties.find((item) => item.id === id);
          if (!duty) {
            return {
              duty: dataset.duties[0]!,
              toast: { type: 'info' as const, message: 'Piket tidak ditemukan di data offline.' },
            };
          }
          const completed: Duty = {
            ...duty,
            completedAt: new Date().toISOString(),
            status: 'COMPLETED',
            canComplete: false,
          };
          await storage.save({
            ...dataset,
            duties: dataset.duties.map((item) => (item.id === id ? completed : item)),
          });
          return { duty: completed, toast: { type: 'success' as const, message: 'Piket ditandai selesai.' } };
        },
      ),

    homework: () =>
      read(
        () => api.homework(),
        async () => ({ items: (await storage.load()).homework }) satisfies Page<Homework>,
      ),

    exams: () =>
      read(
        () => api.exams(),
        async () =>
          ({
            items: [...(await storage.load()).exams].sort((a, b) => a.examDate.localeCompare(b.examDate)),
          }) satisfies Page<Exam>,
      ),

    subjects: () =>
      read(
        () => api.subjects(),
        async () => ({ items: (await storage.load()).subjects }) satisfies Page<Subject>,
      ),

    uniformChecklist: (date?: string) =>
      read(
        () => api.uniformChecklist(date),
        async () => {
          const dataset = await storage.load();
          // A cached checklist belongs to the day it was generated for.
          if (date && dataset.uniform.date !== date) return demoUniform(date);
          return dataset.uniform;
        },
      ),

    toggleUniform: (date: string, itemKey: string, checked: boolean) =>
      read(
        () => api.toggleUniform(date, itemKey, checked),
        async () => {
          const dataset = await storage.load();
          const checkedKeys = dataset.uniform.items
            .filter((item) => (item.key === itemKey ? checked : item.checked))
            .map((item) => item.key);
          const checklist: UniformChecklist = demoUniform(date, checkedKeys);
          await storage.save({ ...dataset, uniform: checklist });
          return checklist;
        },
      ),
  };
}
