import AsyncStorage from '@react-native-async-storage/async-storage';

import { formatDateKey } from '../utils/format';
import { createEmptyDataset, demoUniform, type OfflineDataset } from './seed';

export const DATASET_KEY = 'asistenku.dataset.v2';

/** Ticks belong to the day they were made; a new day starts a clean checklist. */
function rollUniformToToday(dataset: OfflineDataset): OfflineDataset {
  const today = formatDateKey(new Date());
  if (dataset.uniform.date === today) return dataset;
  return { ...dataset, uniform: demoUniform(today) };
}

type Backend = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;

export interface OfflineStorage {
  /** Local dataset, seeded on first use and persisted afterwards. */
  load(): Promise<OfflineDataset>;
  save(dataset: OfflineDataset): Promise<void>;
  reset(): Promise<void>;
}

export function createOfflineStorage(backend: Backend = AsyncStorage): OfflineStorage {
  let cache: OfflineDataset | null = null;

  return {
    load: async () => {
      if (cache) return cache;
      const raw = await backend.getItem(DATASET_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as OfflineDataset;
          cache = rollUniformToToday(parsed);
          if (cache !== parsed) {
            await backend.setItem(DATASET_KEY, JSON.stringify(cache));
          }
          return cache;
        } catch {
          await backend.removeItem(DATASET_KEY);
        }
      }
      cache = createEmptyDataset();
      await backend.setItem(DATASET_KEY, JSON.stringify(cache));
      return cache;
    },
    save: async (dataset) => {
      cache = dataset;
      await backend.setItem(DATASET_KEY, JSON.stringify(dataset));
    },
    reset: async () => {
      cache = null;
      await backend.removeItem(DATASET_KEY);
    },
  };
}
