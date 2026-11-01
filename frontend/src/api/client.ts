import Constants from 'expo-constants';

import type {
  ApiErrorBody,
  AuthResult,
  Dashboard,
  Duty,
  Exam,
  Homework,
  Page,
  Subject,
  TokenPair,
  UniformChecklist,
  User,
} from './types';

export interface Session {
  accessToken: string;
  refreshToken: string;
}

export interface TokenStore {
  get(): Session | null;
  set(session: Session): void;
  clear(): void;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Resolves the API base URL once. `EXPO_PUBLIC_API_URL` wins so a release build
 * can point at staging without editing `app.json`.
 */
export function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
  return (extra?.apiUrl ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
}

/**
 * Thin fetch wrapper: JSON in/out, bearer token, single transparent refresh on
 * 401, and a typed `ApiError` that keeps the server's error code.
 */
export function createApi(options: {
  baseUrl?: string;
  store: TokenStore;
  fetchImpl?: FetchLike;
}) {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  let refreshing: Promise<boolean> | null = null;

  async function refresh(): Promise<boolean> {
    const session = options.store.get();
    if (!session?.refreshToken) return false;
    // Collapse concurrent 401s into one rotation; refresh tokens are one-shot.
    refreshing ??= (async () => {
      try {
        const response = await fetchImpl(`${baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        });
        if (!response.ok) {
          options.store.clear();
          return false;
        }
        const body = (await response.json()) as { tokens: TokenPair };
        options.store.set({
          accessToken: body.tokens.accessToken,
          refreshToken: body.tokens.refreshToken,
        });
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const session = options.store.get();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    };

    const response = await fetchImpl(`${baseUrl}${path}`, { ...init, headers });

    if (response.status === 401 && retry && (await refresh())) {
      return request<T>(path, init, false);
    }

    const text = await response.text();
    const body: unknown = text ? safeJson(text) : null;
    if (!response.ok) {
      const error = (body as ApiErrorBody | null)?.error;
      throw new ApiError(
        response.status,
        error?.code ?? 'NETWORK_ERROR',
        error?.message ?? `Request failed with status ${response.status}`,
        error?.details,
      );
    }
    return body as T;
  }

  return {
    request,
    login: (email: string, password: string) =>
      request<AuthResult>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    register: (input: {
      email: string;
      password: string;
      fullName: string;
      role?: User['role'];
      classId?: string | null;
      inviteCode?: string;
    }) => request<AuthResult>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
    me: async () => (await request<{ user: User }>('/auth/me')).user,
    logout: () =>
      request<void>('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: options.store.get()?.refreshToken ?? '' }),
      }),
    dashboard: (date?: string) =>
      request<Dashboard>(`/dashboard${date ? `?date=${encodeURIComponent(date)}` : ''}`),
    duties: (query: Partial<Record<'from' | 'to' | 'completed' | 'limit', string>> = {}) =>
      request<Page<Duty>>(`/duties${queryString(query)}`),
    completeDuty: (id: string) =>
      request<{ duty: Duty; toast: { type: 'success' | 'info'; message: string } }>(
        `/duties/${id}/complete`,
        { method: 'POST' },
      ),
    homework: () => request<Page<Homework>>('/homework'),
    exams: (query: Partial<Record<'from' | 'to', string>> = {}) =>
      request<Page<Exam>>(`/exams${queryString(query)}`),
    subjects: () => request<Page<Subject>>('/subjects'),
    uniformChecklist: (date?: string) =>
      request<UniformChecklist>(
        `/uniform/checklist${date ? `?date=${encodeURIComponent(date)}` : ''}`,
      ),
    toggleUniform: async (date: string, itemKey: string, checked: boolean) =>
      (
        await request<{ checklist: UniformChecklist }>('/uniform/checklist', {
          method: 'PATCH',
          body: JSON.stringify({ date, itemKey, checked }),
        })
      ).checklist,
  };
}

export type Api = ReturnType<typeof createApi>;

function queryString(query: Record<string, string | undefined>): string {
  const params = Object.entries(query).filter((entry): entry is [string, string] => !!entry[1]);
  if (params.length === 0) return '';
  return `?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
