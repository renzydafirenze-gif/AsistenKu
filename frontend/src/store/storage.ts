import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Session, TokenStore } from '../api/client';

const SESSION_KEY = 'asistensiswa.session.v1';

/**
 * Session persistence. AsyncStorage is not encrypted, so only the rotating
 * token pair lives here — never the password or profile PII. The pair is
 * revoked server-side on logout.
 *
 * ponytail: no biometric gate/keychain yet; add expo-secure-store before
 * handling accounts other than the student's own device.
 */
export interface SessionStorage extends TokenStore {
  hydrate(): Promise<Session | null>;
}

export function createSessionStorage(
  backend: Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'> = AsyncStorage,
): SessionStorage {
  let cached: Session | null = null;
  return {
    get: () => cached,
    set: (session) => {
      cached = session;
      void backend.setItem(SESSION_KEY, JSON.stringify(session));
    },
    clear: () => {
      cached = null;
      void backend.removeItem(SESSION_KEY);
    },
    hydrate: async () => {
      if (cached) return cached;
      const raw = await backend.getItem(SESSION_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as Partial<Session>;
        if (!parsed.accessToken || !parsed.refreshToken) return null;
        cached = { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
        return cached;
      } catch {
        await backend.removeItem(SESSION_KEY);
        return null;
      }
    },
  };
}
