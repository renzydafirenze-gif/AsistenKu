import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ApiError, type Api } from '../src/api/client';
import { DashboardScreen } from '../src/screens/DashboardScreen';
import { DutyScreen } from '../src/screens/DutyScreen';
import { ExamScreen } from '../src/screens/ExamScreen';
import { HomeworkScreen } from '../src/screens/HomeworkScreen';
import { LoginScreen } from '../src/screens/LoginScreen';
import { RegisterScreen } from '../src/screens/RegisterScreen';
import { UniformScreen } from '../src/screens/UniformScreen';
import { RootNavigator } from '../src/navigation/RootNavigator';
import { createStore, type AppStore, type StoreDeps } from '../src/store';
import { createOfflineStorage } from '../src/offline/storage';
import { login } from '../src/store/authSlice';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { lightTheme } from '../src/theme/tokens';
import { formatDateKey, formatIndonesianDay } from '../src/utils/format';
import { authResult, dashboard, duty, exam, homework, subject, uniform } from './fixtures';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function fakeStorage() {
  let session: { accessToken: string; refreshToken: string } | null = null;
  return {
    get: () => session,
    set: (next: typeof session) => {
      session = next;
    },
    clear: () => {
      session = null;
    },
    hydrate: async () => session,
  };
}

function fakeApi(overrides: Partial<Api> = {}): Api {
  const notImplemented = () => Promise.reject(new Error('not implemented'));
  return {
    request: notImplemented,
    login: async () => authResult,
    register: async () => authResult,
    me: async () => authResult.user,
    logout: async () => undefined,
    dashboard: async () => dashboard,
    duties: async () => ({ items: [duty] }),
    completeDuty: async () => ({
      duty: { ...duty, status: 'COMPLETED', completedAt: '2026-10-31T01:00:00.000Z' },
      toast: { type: 'success', message: 'Selesai' },
    }),
    homework: async () => ({ items: [homework] }),
    exams: async () => ({ items: [exam] }),
    subjects: async () => ({ items: [subject] }),
    uniformChecklist: async () => uniform,
    toggleUniform: async (_date, itemKey, checked) => ({
      ...uniform,
      items: uniform.items.map((item) =>
        item.key === itemKey ? { ...item, checked } : item,
      ),
      completedCount: checked ? 2 : 1,
      status: checked ? 'COMPLETE' : 'PARTIAL',
    }),
    ...overrides,
  } as Api;
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

function makeStore(api: Partial<Api> = {}): AppStore {
  const deps: StoreDeps = {
    api: fakeApi(api),
    storage: fakeStorage(),
    offline: createOfflineStorage(memoryBackend()),
  };
  return createStore(deps);
}

function renderScreen(node: React.ReactElement, store = makeStore()) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Provider store={store}>
        <ThemeProvider theme={lightTheme}>{node}</ThemeProvider>
      </Provider>
    </SafeAreaProvider>,
  );
}

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as never;

describe('dashboard screen', () => {
  it('renders greeting, cards and navigates by tab', async () => {
    const { findByText, getByTestId } = renderScreen(<DashboardScreen />);

    expect(await findByText('Selamat pagi')).toBeOnTheScreen();
    const today = formatIndonesianDay(formatDateKey(new Date()));
    expect(await findByText(`Ani Lestari · ${today}`)).toBeOnTheScreen();

    fireEvent.press(getByTestId('dashboard-card-duty'));
    expect(mockNavigate).toHaveBeenCalledWith('Duty');

    fireEvent.press(getByTestId('dashboard-card-subjects'));
    expect(mockNavigate).toHaveBeenCalledWith('Dashboard');
  });

  it('shows the late-homework warning and next exam', async () => {
    const { findByText, findAllByText } = renderScreen(<DashboardScreen />);
    // The badge appears both on the homework card and its inline warning.
    expect((await findAllByText('1 terlambat')).length).toBeGreaterThan(0);
    expect(await findByText(/Ujian berikutnya: UTS Matematika/)).toBeOnTheScreen();
  });

  it('surfaces a retry hint when the dashboard is unavailable', async () => {
    const store = makeStore({ dashboard: async () => Promise.reject(new Error('offline')) });
    const { findByText } = renderScreen(<DashboardScreen />, store);
    expect(await findByText('Dasbor belum tersedia')).toBeOnTheScreen();
  });
});

describe('duty screen', () => {
  it('lists the duty and completes it', async () => {
    const completeDuty = jest.fn(async () => ({
      duty: { ...duty, status: 'COMPLETED' as const, completedAt: '2026-10-31T01:00:00.000Z' },
      toast: { type: 'success' as const, message: 'Selesai' },
    }));
    const store = makeStore({ completeDuty });
    const { findByText, getAllByText } = renderScreen(<DutyScreen />, store);

    expect(await findByText('Sabtu, 31 Okt 2026')).toBeOnTheScreen();
    fireEvent.press(await findByText('Tandai selesai'));

    await waitFor(() => expect(completeDuty).toHaveBeenCalledWith(duty.id));
    expect(getAllByText('Selesai').length).toBeGreaterThan(0);
  });

  it('shows an empty state without duties', async () => {
    const store = makeStore({ duties: async () => ({ items: [] }) });
    const { findByText } = renderScreen(<DutyScreen />, store);
    expect(await findByText('Belum ada jadwal piket')).toBeOnTheScreen();
  });
});

describe('homework screen', () => {
  it('flags late homework', async () => {
    const { findAllByText, findByText } = renderScreen(<HomeworkScreen />);
    expect(await findByText('Latihan pecahan')).toBeOnTheScreen();
    expect((await findAllByText('Terlambat')).length).toBeGreaterThan(0);
  });

  it('shows the empty state', async () => {
    const store = makeStore({ homework: async () => ({ items: [] }) });
    const { findByText } = renderScreen(<HomeworkScreen />, store);
    expect(await findByText('Tidak ada PR')).toBeOnTheScreen();
  });
});

describe('exam screen', () => {
  it('shows the exam window and publication state', async () => {
    const { findByText } = renderScreen(<ExamScreen />);
    expect(await findByText('UTS Matematika')).toBeOnTheScreen();
    expect(await findByText('Terpublikasi')).toBeOnTheScreen();
    expect(await findByText(/07:30–09:00/)).toBeOnTheScreen();
  });
});

describe('uniform screen', () => {
  it('toggles an item and updates progress', async () => {
    const toggleUniform = jest.fn(async (_date: string, itemKey: string, checked: boolean) => ({
      ...uniform,
      items: uniform.items.map((item) => (item.key === itemKey ? { ...item, checked } : item)),
      completedCount: checked ? 2 : 1,
      total: 2,
      status: checked ? ('COMPLETE' as const) : ('PARTIAL' as const),
    }));
    const store = makeStore({ toggleUniform });
    const { findByText, getByRole } = renderScreen(<UniformScreen />, store);

    expect(await findByText('Kemeja putih')).toBeOnTheScreen();
    fireEvent.press(getByRole('checkbox', { name: 'Dasi, Atribut' }));

    await waitFor(() => expect(toggleUniform).toHaveBeenCalledWith(uniform.date, 'tie', true));
    expect(await findByText('2/2 item selesai')).toBeOnTheScreen();
  });

  it('explains holidays', async () => {
    const store = makeStore({
      uniformChecklist: async () => ({
        ...uniform,
        items: [],
        completedCount: 0,
        total: 0,
        status: 'HOLIDAY',
        note: 'Libur semester',
      }),
    });
    const { findByText } = renderScreen(<UniformScreen />, store);
    expect(await findByText('Hari libur')).toBeOnTheScreen();
    expect(await findByText('Libur semester')).toBeOnTheScreen();
  });
});

describe('auth screens', () => {
  it('keeps submit disabled until the form is valid, then signs in', async () => {
    const login = jest.fn(async () => authResult);
    const store = makeStore({ login });
    const { getByRole, getByLabelText } = renderScreen(
      <LoginScreen navigation={navigation} route={{ key: 'Login', name: 'Login' }} />,
      store,
    );

    expect(getByRole('button', { name: 'Masuk' })).toBeDisabled();
    fireEvent.changeText(getByLabelText('Email'), 'ani@sekolah.test');
    fireEvent.changeText(getByLabelText('Kata sandi'), 'Rahasia123');
    expect(getByRole('button', { name: 'Masuk' })).toBeEnabled();

    fireEvent.press(getByRole('button', { name: 'Masuk' }));
    await waitFor(() => expect(login).toHaveBeenCalledWith('ani@sekolah.test', 'Rahasia123'));
    expect(store.getState().auth.status).toBe('authenticated');
  });

  it('shows a friendly error for bad credentials', async () => {
    const store = makeStore({
      login: async () => Promise.reject(new ApiError(401, 'INVALID_CREDENTIALS', 'nope')),
    });
    const { getByRole, getByLabelText, findByText } = renderScreen(
      <LoginScreen navigation={navigation} route={{ key: 'Login', name: 'Login' }} />,
      store,
    );

    fireEvent.changeText(getByLabelText('Email'), 'ani@sekolah.test');
    fireEvent.changeText(getByLabelText('Kata sandi'), 'salah123');
    fireEvent.press(getByRole('button', { name: 'Masuk' }));

    expect(await findByText('Email atau kata sandi salah.')).toBeOnTheScreen();
  });

  it('validates the register form and submits', async () => {
    const register = jest.fn(async () => authResult);
    const store = makeStore({ register });
    const { getByRole, getByLabelText } = renderScreen(
      <RegisterScreen navigation={navigation} route={{ key: 'Register', name: 'Register' }} />,
      store,
    );

    expect(getByRole('button', { name: 'Buat akun' })).toBeDisabled();
    fireEvent.changeText(getByLabelText('Nama lengkap'), 'Ani Lestari');
    fireEvent.changeText(getByLabelText('Email'), 'ani@sekolah.test');
    fireEvent.changeText(getByLabelText('Kata sandi'), 'Rahasia123');
    expect(getByRole('button', { name: 'Buat akun' })).toBeEnabled();

    fireEvent.press(getByRole('button', { name: 'Buat akun' }));
    await waitFor(() => expect(register).toHaveBeenCalled());
  });
});

describe('offline mode', () => {
  it('opens the dashboard from bundled data without a server', async () => {
    const store = makeStore({
      dashboard: async () => Promise.reject(new TypeError('Network request failed')),
    });
    const { getByRole, findByText, findAllByText } = renderScreen(<RootNavigator booted />, store);

    fireEvent.press(getByRole('button', { name: 'Mode offline (data contoh)' }));

    expect(await findByText('Ani Lestari · ' + formatIndonesianDay(formatDateKey(new Date())) + ' · Mode offline')).toBeOnTheScreen();
    expect(await findByText(/Mode offline: data contoh/)).toBeOnTheScreen();
    expect((await findAllByText('Terlambat')).length).toBeGreaterThan(0);
  });
});

describe('root navigator', () => {
  it('shows the splash while the session is restoring', () => {
    const { getByTestId } = renderScreen(<RootNavigator booted={false} />);
    expect(getByTestId('boot-splash')).toBeOnTheScreen();
  });

  it('renders the auth stack when signed out', async () => {
    const { findByRole } = renderScreen(<RootNavigator booted />);
    expect(await findByRole('button', { name: 'Masuk' })).toBeOnTheScreen();
  });

  it('renders the tab shell when signed in', async () => {
    const store = makeStore();
    await store.dispatch(login({ email: 'ani@sekolah.test', password: 'Rahasia123' }));
    const { findByText, findAllByText } = renderScreen(<RootNavigator booted />, store);
    expect(await findByText('Selamat pagi')).toBeOnTheScreen();
    // Tab label and dashboard card share the word.
    expect((await findAllByText('Seragam')).length).toBeGreaterThan(0);
  });
});
