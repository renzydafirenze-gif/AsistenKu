import type {
  Dashboard,
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
 * Local data source. There is no network path in this app: every read and write
 * goes to the bundled dataset persisted in AsyncStorage.
 *
 * ponytail: writes stay on the device. Add a change log + export/import (or a
 * server) when data must move between devices.
 */
export interface Repository {
  dashboard(): Promise<Dashboard>;
  duties(): Promise<Page<Duty>>;
  completeDuty(id: string): Promise<{
    duty: Duty;
    toast: { type: 'success' | 'info'; message: string };
  }>;
  homework(): Promise<Page<Homework>>;
  exams(): Promise<Page<Exam>>;
  subjects(): Promise<Page<Subject>>;
  uniformChecklist(date?: string): Promise<UniformChecklist>;
  toggleUniform(date: string, itemKey: string, checked: boolean): Promise<UniformChecklist>;
  /** Drops local edits and re-seeds from the bundled dataset. */
  reset(): Promise<void>;
}

export function createRepository(storage: OfflineStorage): Repository {
  return {
    dashboard: async () => buildOfflineDashboard(await storage.load()),

    duties: async () => {
      const dataset = await storage.load();
      return { items: [...dataset.duties].sort((a, b) => a.date.localeCompare(b.date)) };
    },

    completeDuty: async (id) => {
      const dataset = await storage.load();
      const duty = dataset.duties.find((item) => item.id === id);
      if (!duty) {
        return {
          duty: dataset.duties[0]!,
          toast: { type: 'info' as const, message: 'Piket tidak ditemukan.' },
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

    homework: async () => ({ items: (await storage.load()).homework }),

    exams: async () => {
      const dataset = await storage.load();
      return {
        items: [...dataset.exams].sort((a, b) => a.examDate.localeCompare(b.examDate)),
      };
    },

    subjects: async () => ({ items: (await storage.load()).subjects }),

    uniformChecklist: async (date?: string) => {
      const dataset = await storage.load();
      // A stored checklist belongs to the day it was generated for.
      if (date && dataset.uniform.date !== date) return demoUniform(date);
      return dataset.uniform;
    },

    toggleUniform: async (date, itemKey, checked) => {
      const dataset = await storage.load();
      const checkedKeys = dataset.uniform.items
        .filter((item) => (item.key === itemKey ? checked : item.checked))
        .map((item) => item.key);
      const checklist = demoUniform(date, checkedKeys);
      await storage.save({ ...dataset, uniform: checklist });
      return checklist;
    },

    reset: async () => {
      await storage.reset();
    },
  };
}
