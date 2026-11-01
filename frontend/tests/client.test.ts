import { ApiError, createApi, resolveBaseUrl, type Session } from '../src/api/client';

function memoryStore(initial: Session | null = null) {
  let session = initial;
  return {
    get: () => session,
    set: (next: Session) => {
      session = next;
    },
    clear: () => {
      session = null;
    },
    read: () => session,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response;
}

describe('api client', () => {
  it('falls back to the Expo config URL when no env override exists', () => {
    expect(resolveBaseUrl()).toMatch(/\/api\/v1$/);
  });

  it('sends the bearer token and parses JSON', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const api = createApi({
      baseUrl: 'https://api.test/api/v1',
      store: memoryStore({ accessToken: 'a1', refreshToken: 'r1' }),
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return jsonResponse({ items: [] });
      },
    });

    await api.duties({ limit: '10', from: '2026-10-31', completed: undefined });

    expect(calls[0]?.url).toBe('https://api.test/api/v1/duties?limit=10&from=2026-10-31');
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe('Bearer a1');
  });

  it('maps error bodies to ApiError and keeps the server code', async () => {
    const api = createApi({
      baseUrl: 'https://api.test/api/v1',
      store: memoryStore(),
      fetchImpl: async () =>
        jsonResponse(
          { error: { code: 'FORBIDDEN', message: 'Tidak diizinkan', details: [{ path: 'x' }] } },
          403,
        ),
    });

    await expect(api.homework()).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Tidak diizinkan',
    });
  });

  it('handles non-JSON error bodies', async () => {
    const api = createApi({
      baseUrl: 'https://api.test/api/v1',
      store: memoryStore(),
      fetchImpl: async () => ({ ok: false, status: 502, text: async () => '<html>502</html>' }) as Response,
    });

    await expect(api.exams()).rejects.toBeInstanceOf(ApiError);
  });

  it('rotates the refresh token once and retries the request', async () => {
    const store = memoryStore({ accessToken: 'old', refreshToken: 'r1' });
    let seen = 0;
    const api = createApi({
      baseUrl: 'https://api.test/api/v1',
      store,
      fetchImpl: async (url) => {
        if (url.endsWith('/auth/refresh')) {
          return jsonResponse({ tokens: { accessToken: 'new', refreshToken: 'r2' } });
        }
        seen += 1;
        if (seen === 1) return jsonResponse({ error: { code: 'TOKEN_EXPIRED' } }, 401);
        return jsonResponse({ items: [] });
      },
    });

    await expect(api.duties()).resolves.toEqual({ items: [] });
    expect(store.read()).toEqual({ accessToken: 'new', refreshToken: 'r2' });
  });

  it('clears the session when the refresh token is rejected', async () => {
    const store = memoryStore({ accessToken: 'old', refreshToken: 'stale' });
    const api = createApi({
      baseUrl: 'https://api.test/api/v1',
      store,
      fetchImpl: async (url) =>
        url.endsWith('/auth/refresh')
          ? jsonResponse({ error: { code: 'REFRESH_REUSED' } }, 401)
          : jsonResponse({ error: { code: 'UNAUTHORIZED' } }, 401),
    });

    await expect(api.duties()).rejects.toMatchObject({ status: 401 });
    expect(store.read()).toBeNull();
  });

  it('does not loop when the retry also fails', async () => {
    let hits = 0;
    const api = createApi({
      baseUrl: 'https://api.test/api/v1',
      store: memoryStore({ accessToken: 'a', refreshToken: 'r' }),
      fetchImpl: async (url) => {
        if (url.endsWith('/auth/refresh')) return jsonResponse({ tokens: { accessToken: 'b', refreshToken: 'r2' } });
        hits += 1;
        return jsonResponse({ error: { code: 'UNAUTHORIZED' } }, 401);
      },
    });

    await expect(api.homework()).rejects.toMatchObject({ status: 401 });
    expect(hits).toBe(2);
  });

  it('unwraps the envelope endpoints', async () => {
    const api = createApi({
      baseUrl: 'https://api.test/api/v1',
      store: memoryStore(),
      fetchImpl: async (url) => {
        if (url.endsWith('/auth/me')) return jsonResponse({ user: { id: 'u1' } });
        if (url.includes('/complete')) return jsonResponse({ duty: { id: 'd1' }, toast: { type: 'success', message: 'ok' } });
        if (url.endsWith('/uniform/checklist')) return jsonResponse({ checklist: { date: '2026-10-31', items: [] } });
        return jsonResponse({});
      },
    });

    await expect(api.me()).resolves.toEqual({ id: 'u1' });
    await expect(api.completeDuty('d1')).resolves.toMatchObject({ duty: { id: 'd1' } });
    await expect(api.toggleUniform('2026-10-31', 'shirt', true)).resolves.toMatchObject({
      date: '2026-10-31',
    });
  });
});
