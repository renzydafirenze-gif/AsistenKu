import AsyncStorage from '@react-native-async-storage/async-storage';

import { createDemoDataset, type OfflineDataset } from './seed';

const DATASET_KEY = 'asistensiswa.dataset.v1';

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
          cache = JSON.parse(raw) as OfflineDataset;
          return cache;
        } catch {
          await backend.removeItem(DATASET_KEY);
        }
      }
      cache = createDemoDataset();
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
