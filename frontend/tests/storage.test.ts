import { createSessionStorage } from '../src/store/storage';

function backend(initial: string | null) {
  let raw = initial;
  return {
    getItem: async () => raw,
    setItem: async (_key: string, value: string) => {
      raw = value;
    },
    removeItem: async () => {
      raw = null;
    },
    read: () => raw,
  };
}

describe('session storage', () => {
  it('persists and hydrates the token pair', async () => {
    const store = backend(null);
    const storage = createSessionStorage(store);

    storage.set({ accessToken: 'a', refreshToken: 'r' });
    expect(storage.get()).toEqual({ accessToken: 'a', refreshToken: 'r' });
    await expect(storage.hydrate()).resolves.toEqual({ accessToken: 'a', refreshToken: 'r' });
    expect(store.read()).toContain('refreshToken');
  });

  it('returns null when nothing is stored', async () => {
    const storage = createSessionStorage(backend(null));
    await expect(storage.hydrate()).resolves.toBeNull();
  });

  it('drops corrupt or incomplete payloads', async () => {
    const corrupt = backend('{not json');
    await expect(createSessionStorage(corrupt).hydrate()).resolves.toBeNull();
    expect(corrupt.read()).toBeNull();

    const incomplete = backend(JSON.stringify({ accessToken: 'a' }));
    await expect(createSessionStorage(incomplete).hydrate()).resolves.toBeNull();
  });

  it('clears the cached session on sign-out', () => {
    const store = backend(null);
    const storage = createSessionStorage(store);
    storage.set({ accessToken: 'a', refreshToken: 'r' });
    storage.clear();
    expect(storage.get()).toBeNull();
    expect(store.read()).toBeNull();
  });
});
