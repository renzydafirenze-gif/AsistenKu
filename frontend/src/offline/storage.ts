import AsyncStorage from '@react-native-async-storage/async-storage';

import type { OfflineDataset } from './seed';
import { createEmptyDataset } from './seed';

export const DATASET_KEY = 'asistenku.dataset.v2';

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
    Array.isArray(candidate.uniformPlans)
  );
}

/**
 * v2 payloads written before the uniform feature became a reminder stored a
 * daily checklist instead of `uniformPlans`. Keep every other array so an
 * existing install does not lose data; the student re-enters the week.
 */
function migrate(value: unknown): OfflineDataset | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (Array.isArray(candidate.uniformPlans)) return null;
  if (!Array.isArray(candidate.duties) || !Array.isArray(candidate.homework)) return null;
  if (!Array.isArray(candidate.exams) || !Array.isArray(candidate.subjects)) return null;
  if (!candidate.user || typeof candidate.user !== 'object') return null;
  const { uniform: legacyUniform, ...rest } = candidate;
  void legacyUniform;
  return { ...(rest as unknown as OfflineDataset), uniformPlans: [] };
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
      if (cache) return cache;
      const raw = await backend.getItem(DATASET_KEY);
      if (raw) {
        try {
          const parsed: unknown = JSON.parse(raw);
          if (isDataset(parsed)) {
            await persist(parsed);
            return parsed;
          }
          const migrated = migrate(parsed);
          if (migrated) {
            await persist(migrated);
            return migrated;
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
