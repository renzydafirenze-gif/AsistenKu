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

/**
 * Guards against a half-written or older payload: a dataset without the
 * expected arrays would crash the first screen that maps over it.
 */
function isDataset(value: unknown): value is OfflineDataset {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<OfflineDataset>;
  return (
    !!candidate.user &&
    typeof candidate.user.fullName === 'string' &&
    Array.isArray(candidate.duties) &&
    Array.isArray(candidate.homework) &&
    Array.isArray(candidate.exams) &&
    Array.isArray(candidate.subjects) &&
    !!candidate.uniform &&
    Array.isArray(candidate.uniform.items)
  );
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

  const persist = async (dataset: OfflineDataset) => {
    cache = dataset;
    await backend.setItem(DATASET_KEY, JSON.stringify(dataset));
  };

  return {
    load: async () => {
      if (cache) {
        // The app can stay open past midnight; roll the day over on read.
        const rolled = rollUniformToToday(cache);
        if (rolled !== cache) await persist(rolled);
        return rolled;
      }
      const raw = await backend.getItem(DATASET_KEY);
      if (raw) {
        try {
          const parsed: unknown = JSON.parse(raw);
          if (isDataset(parsed)) {
            const rolled = rollUniformToToday(parsed);
            await persist(rolled);
            return rolled;
          }
        } catch {
          // Fall through to a fresh dataset below.
        }
        await backend.removeItem(DATASET_KEY);
      }
      const empty = createEmptyDataset();
      await persist(empty);
      return empty;
    },
    save: async (dataset) => {
      await persist(dataset);
    },
    reset: async () => {
      cache = null;
      await backend.removeItem(DATASET_KEY);
    },
  };
}
