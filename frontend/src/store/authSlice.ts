import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { ApiError, type Api, type Session } from '../api/client';
import type { AuthResult, User } from '../api/types';
import type { OfflineStorage } from '../offline/storage';
import type { SessionStorage } from './storage';

export interface AuthState {
  user: User | null;
  status: 'idle' | 'loading' | 'authenticated' | 'error';
  error: string | null;
  /** True when the app runs on the bundled dataset instead of the API. */
  offline: boolean;
}

const initialState: AuthState = { user: null, status: 'idle', error: null, offline: false };

interface AuthDeps {
  api: Api;
  storage: SessionStorage;
  offline: OfflineStorage;
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Email atau kata sandi salah.';
    if (error.status === 429) return 'Terlalu banyak percobaan. Coba lagi nanti.';
    return error.message;
  }
  return 'Tidak dapat menghubungi server. Periksa koneksi internet.';
}

function applySession(storage: SessionStorage, result: AuthResult): void {
  const session: Session = {
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken,
  };
  storage.set(session);
}

export const login = createAsyncThunk<
  User,
  { email: string; password: string },
  { extra: AuthDeps }
>('auth/login', async ({ email, password }, { extra, rejectWithValue }) => {
  try {
    const result = await extra.api.login(email.trim().toLowerCase(), password);
    applySession(extra.storage, result);
    return result.user;
  } catch (error) {
    return rejectWithValue(messageFor(error));
  }
});

export const register = createAsyncThunk<
  User,
  { email: string; password: string; fullName: string; classId?: string | null; inviteCode?: string },
  { extra: AuthDeps }
>('auth/register', async (input, { extra, rejectWithValue }) => {
  try {
    const result = await extra.api.register({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      fullName: input.fullName,
      classId: input.classId ?? null,
      ...(input.inviteCode ? { inviteCode: input.inviteCode } : {}),
    });
    applySession(extra.storage, result);
    return result.user;
  } catch (error) {
    return rejectWithValue(messageFor(error));
  }
});

/** Opens the bundled dataset without credentials (airplane mode / demo). */
export const enterOfflineMode = createAsyncThunk<User, void, { extra: AuthDeps }>(
  'auth/offline',
  async (_arg, { extra }) => {
    const user = (await extra.offline.load()).user;
    await extra.offline.setUser(user);
    return user;
  },
);

/**
 * Restores a session on cold start: an offline user first, otherwise the stored
 * token pair validated through `/auth/me`.
 */
export const restoreSession = createAsyncThunk<
  { user: User | null; offline: boolean },
  void,
  { extra: AuthDeps }
>('auth/restore', async (_arg, { extra }) => {
  const offlineUser = await extra.offline.user();
  if (offlineUser) return { user: offlineUser, offline: true };

  const session = await extra.storage.hydrate();
  if (!session) return { user: null, offline: false };
  try {
    return { user: await extra.api.me(), offline: false };
  } catch {
    extra.storage.clear();
    return { user: null, offline: false };
  }
});

export const signOut = createAsyncThunk<void, void, { extra: AuthDeps }>(
  'auth/signOut',
  async (_arg, { extra }) => {
    try {
      await extra.api.logout();
    } catch {
      // Offline sign-out still clears local state; the token expires server-side.
    } finally {
      extra.storage.clear();
      await extra.offline.clearUser();
    }
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearAuthError(state) {
      state.error = null;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.user = action.payload;
        state.offline = false;
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'error';
        state.error = (action.payload as string | undefined) ?? 'Gagal masuk.';
      })
      .addCase(register.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.user = action.payload;
        state.offline = false;
      })
      .addCase(register.rejected, (state, action) => {
        state.status = 'error';
        state.error = (action.payload as string | undefined) ?? 'Gagal mendaftar.';
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.offline = action.payload.offline;
        state.status = action.payload.user ? 'authenticated' : 'idle';
      })
      .addCase(enterOfflineMode.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(enterOfflineMode.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.user = action.payload;
        state.offline = true;
      })
      .addCase(enterOfflineMode.rejected, (state) => {
        state.status = 'error';
        state.error = 'Mode offline tidak tersedia.';
      })
      .addCase(signOut.fulfilled, (state) => {
        state.user = null;
        state.status = 'idle';
        state.error = null;
        state.offline = false;
      });
  },
});

export const { clearAuthError } = authSlice.actions;
export const authReducer = authSlice.reducer;
