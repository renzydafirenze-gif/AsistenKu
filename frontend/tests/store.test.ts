import { ApiError, type Api, type Session } from '../src/api/client';
import { createStore, type StoreDeps } from '../src/store';
import { createOfflineStorage } from '../src/offline/storage';
import {
  clearAuthError,
  enterOfflineMode,
  login,
  register,
  restoreSession,
  signOut,
} from '../src/store/authSlice';
import { completeDuty, loadDashboard, loadDuties, loadHomework, resetData } from '../src/store/dataSlice';
import { createSessionStorage } from '../src/store/storage';
import { authResult, dashboard, duty, homework, student } from './fixtures';

function fakeStorage(initial: Session | null = null) {
  let raw = initial ? JSON.stringify(initial) : null;
  return createSessionStorage({
    getItem: async () => raw,
    setItem: async (_key, value) => {
      raw = value;
    },
    removeItem: async () => {
      raw = null;
    },
  });
}

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

/** Fresh offline storage per store so demo data cannot leak between tests. */
function makeStore(deps: StoreDeps) {
  return createStore({ ...deps, offline: createOfflineStorage(memoryBackend()) });
}

function fakeApi(overrides: Partial<Api> = {}): Api {
  const notImplemented = () => Promise.reject(new Error('not implemented'));
  return {
    request: notImplemented,
    login: notImplemented,
    register: notImplemented,
    me: notImplemented,
    logout: async () => undefined,
    dashboard: notImplemented,
    duties: async () => ({ items: [] }),
    completeDuty: async () => ({ duty, toast: { type: 'success', message: 'ok' } }),
    homework: async () => ({ items: [] }),
    exams: async () => ({ items: [] }),
    subjects: async () => ({ items: [] }),
    uniformChecklist: notImplemented,
    toggleUniform: notImplemented,
    ...overrides,
  } as Api;
}

describe('auth slice', () => {
  it('logs in, stores the session and exposes the user', async () => {
    const storage = fakeStorage();
    const store = makeStore({ api: fakeApi({ login: async () => authResult }), storage });

    await store.dispatch(login({ email: '  ANI@sekolah.test ', password: 'Rahasia123' })).unwrap();

    expect(store.getState().auth.status).toBe('authenticated');
    expect(store.getState().auth.user?.fullName).toBe('Ani Lestari');
    expect(storage.get()).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it('maps bad credentials to a friendly Indonesian message', async () => {
    const store = makeStore({
      api: fakeApi({ login: async () => Promise.reject(new ApiError(401, 'INVALID_CREDENTIALS', 'nope')) }),
      storage: fakeStorage(),
    });

    await store.dispatch(login({ email: 'ani@sekolah.test', password: 'wrong' }));

    expect(store.getState().auth.status).toBe('error');
    expect(store.getState().auth.error).toBe('Email atau kata sandi salah.');
    expect(store.getState().auth.user).toBeNull();
  });

  it('maps rate limiting and network failures', async () => {
    const limited = makeStore({
      api: fakeApi({ login: async () => Promise.reject(new ApiError(429, 'RATE_LIMITED', 'slow down')) }),
      storage: fakeStorage(),
    });
    await limited.dispatch(login({ email: 'a@b.c', password: 'x' }));
    expect(limited.getState().auth.error).toMatch(/Terlalu banyak/);

    const offline = makeStore({
      api: fakeApi({ login: async () => Promise.reject(new TypeError('fetch failed')) }),
      storage: fakeStorage(),
    });
    await offline.dispatch(login({ email: 'a@b.c', password: 'x' }));
    expect(offline.getState().auth.error).toMatch(/koneksi/);
  });

  it('registers with an optional invite code', async () => {
    const registerSpy = jest.fn(async () => authResult);
    const store = makeStore({ api: fakeApi({ register: registerSpy }), storage: fakeStorage() });

    await store.dispatch(
      register({ email: 'ani@sekolah.test', password: 'Rahasia123', fullName: 'Ani', inviteCode: 'ABC' }),
    ).unwrap();

    expect(registerSpy).toHaveBeenCalledWith({
      email: 'ani@sekolah.test',
      password: 'Rahasia123',
      fullName: 'Ani',
      classId: null,
      inviteCode: 'ABC',
    });
    expect(store.getState().auth.user?.id).toBe(student.id);
  });

  it('restores a stored session and clears it on failure', async () => {
    const storage = fakeStorage({ accessToken: 'a', refreshToken: 'r' });
    const ok = makeStore({ api: fakeApi({ me: async () => student }), storage });
    await ok.dispatch(restoreSession()).unwrap();
    expect(ok.getState().auth.user?.id).toBe(student.id);

    const stale = fakeStorage({ accessToken: 'a', refreshToken: 'r' });
    const failed = makeStore({
      api: fakeApi({ me: async () => Promise.reject(new ApiError(401, 'UNAUTHORIZED', 'expired')) }),
      storage: stale,
    });
    await failed.dispatch(restoreSession());
    expect(failed.getState().auth.user).toBeNull();
    expect(stale.get()).toBeNull();
  });

  it('returns null without a stored session', async () => {
    const store = makeStore({ api: fakeApi(), storage: fakeStorage() });
    await store.dispatch(restoreSession());
    expect(store.getState().auth.status).toBe('idle');
  });

  it('signs out even when the revoke call fails', async () => {
    const storage = fakeStorage({ accessToken: 'a', refreshToken: 'r' });
    const store = makeStore({
      api: fakeApi({ logout: async () => Promise.reject(new Error('offline')) }),
      storage,
    });
    await store.dispatch(signOut());
    expect(store.getState().auth.user).toBeNull();
    expect(storage.get()).toBeNull();
  });

  it('enters offline mode without credentials and restores it on cold start', async () => {
    const backend = memoryBackend();
    const offline = createOfflineStorage(backend);
    const store = createStore({ api: fakeApi(), storage: fakeStorage(), offline });

    await store.dispatch(enterOfflineMode()).unwrap();
    expect(store.getState().auth.offline).toBe(true);
    expect(store.getState().auth.user?.fullName).toBe('Ani Lestari');

    // A fresh store sharing the same device storage must reopen offline,
    // without calling /auth/me (there is no token).
    const me = jest.fn(async () => Promise.reject(new Error('should not be called')));
    const restored = createStore({
      api: fakeApi({ me }),
      storage: fakeStorage(),
      offline: createOfflineStorage(backend),
    });
    await restored.dispatch(restoreSession());
    expect(restored.getState().auth.offline).toBe(true);
    expect(restored.getState().auth.user?.email).toBe('ani@sekolah.test');
    expect(me).not.toHaveBeenCalled();
  });

  it('signing out leaves offline mode and forgets the demo user', async () => {
    const backend = memoryBackend();
    const offline = createOfflineStorage(backend);
    const store = createStore({ api: fakeApi(), storage: fakeStorage(), offline });
    await store.dispatch(enterOfflineMode()).unwrap();

    await store.dispatch(signOut());
    expect(store.getState().auth.user).toBeNull();
    expect(store.getState().auth.offline).toBe(false);
    expect(await createOfflineStorage(backend).user()).toBeNull();
  });

  it('clears a stale error', async () => {
    const store = makeStore({ api: fakeApi(), storage: fakeStorage() });
    await store.dispatch(login({ email: 'a@b.c', password: 'x' }));
    store.dispatch(clearAuthError());
    expect(store.getState().auth.error).toBeNull();
  });
});

describe('data slice', () => {
  it('loads and stores the dashboard', async () => {
    const store = makeStore({ api: fakeApi({ dashboard: async () => dashboard }), storage: fakeStorage() });
    await store.dispatch(loadDashboard());
    expect(store.getState().data.dashboard.data?.greeting).toBe('Selamat pagi');
    expect(store.getState().data.dashboard.status).toBe('ready');
  });

  it('keeps the last dashboard visible when a refresh fails', async () => {
    let fail = false;
    const store = makeStore({
      api: fakeApi({
        dashboard: async () => {
          if (fail) throw new Error('offline');
          return dashboard;
        },
      }),
      storage: fakeStorage(),
    });
    await store.dispatch(loadDashboard());
    fail = true;
    await store.dispatch(loadDashboard());
    expect(store.getState().data.dashboard.status).toBe('error');
    expect(store.getState().data.dashboard.data?.greeting).toBe('Selamat pagi');
  });

  it('replaces a duty in place after completion', async () => {
    const completed = { ...duty, status: 'COMPLETED' as const, completedAt: '2026-10-31T01:00:00.000Z' };
    const store = makeStore({
      api: fakeApi({
        duties: async () => ({ items: [duty, { ...duty, id: 'other' }] }),
        completeDuty: async () => ({ duty: completed, toast: { type: 'success', message: 'ok' } }),
      }),
      storage: fakeStorage(),
    });

    await store.dispatch(loadDuties());
    await store.dispatch(completeDuty(duty.id));

    expect(store.getState().data.duties.data[0]?.status).toBe('COMPLETED');
    expect(store.getState().data.duties.data).toHaveLength(2);
  });

  it('records homework failures without dropping cached rows', async () => {
    const store = makeStore({
      api: fakeApi({
        homework: async () => ({ items: [homework] }),
      }),
      storage: fakeStorage(),
    });
    await store.dispatch(loadHomework());
    expect(store.getState().data.homework.data[0]?.isLate).toBe(true);

    store.dispatch(resetData());
    expect(store.getState().data.homework.data).toHaveLength(0);
  });
});
