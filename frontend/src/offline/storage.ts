import AsyncStorage from '@react-native-async-storage/async-storage';

import type { User } from '../api/types';
import { createDemoDataset, type OfflineDataset } from './seed';

const DATASET_KEY = 'asistensiswa.offline.dataset.v1';
const USER_KEY = 'asistensiswa.offline.user.v1';

type Backend = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;

export interface OfflineStorage {
  /** Local dataset, seeded on first use and persisted afterwards. */
  load(): Promise<OfflineDataset>;
  save(dataset: OfflineDataset): Promise<void>;
  /** The signed-in demo user while in offline mode. */
  user(): Promise<User | null>;
  setUser(user: User): Promise<void>;
  clearUser(): Promise<void>;
  reset(): Promise<void>;
}

export function createOfflineStorage(backend: Backend = AsyncStorage): OfflineStorage {
  let cache: OfflineDataset | null = null;

  async function load(): Promise<OfflineDataset> {
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
  }

  return {
    load,
    save: async (dataset) => {
      cache = dataset;
      await backend.setItem(DATASET_KEY, JSON.stringify(dataset));
    },
    user: async () => {
      const raw = await backend.getItem(USER_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as User;
      } catch {
        await backend.removeItem(USER_KEY);
        return null;
      }
    },
    setUser: async (user) => {
      await backend.setItem(USER_KEY, JSON.stringify(user));
    },
    clearUser: async () => {
      await backend.removeItem(USER_KEY);
    },
    reset: async () => {
      cache = null;
      await backend.removeItem(DATASET_KEY);
      await backend.removeItem(USER_KEY);
    },
  };
}
