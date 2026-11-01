import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { DashboardScreen } from '../src/screens/DashboardScreen';
import { DutyScreen } from '../src/screens/DutyScreen';
import { ExamScreen } from '../src/screens/ExamScreen';
import { HomeworkScreen } from '../src/screens/HomeworkScreen';
import { UniformScreen } from '../src/screens/UniformScreen';
import { SubjectsScreen } from '../src/screens/SubjectsScreen';
import { RootNavigator } from '../src/navigation/RootNavigator';
import { createOfflineStorage } from '../src/offline/storage';
import { createDemoDataset } from '../src/offline/seed';
import { createStore, type AppStore } from '../src/store';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { lightTheme } from '../src/theme/tokens';
import { formatDateKey, formatIndonesianDay } from '../src/utils/format';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

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

function makeStore(): AppStore {
  return createStore({ offline: createOfflineStorage(memoryBackend()) });
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

const today = formatDateKey(new Date());

describe('dashboard screen', () => {
  it('renders the greeting, cards and navigates by tab', async () => {
    const { findByText, findAllByText, getByTestId } = renderScreen(<DashboardScreen />);

    expect(await findByText(/^Selamat (pagi|siang|sore|malam)$/)).toBeOnTheScreen();
    expect(
      await findByText(`Ani Lestari · ${formatIndonesianDay(today)}`),
    ).toBeOnTheScreen();

    fireEvent.press(getByTestId('dashboard-card-duty'));
    expect(mockNavigate).toHaveBeenCalledWith('Duty');

    fireEvent.press(getByTestId('dashboard-card-homework'));
    expect(mockNavigate).toHaveBeenCalledWith('Homework');

    fireEvent.press(getByTestId('dashboard-card-subjects'));
    expect(mockNavigate).toHaveBeenCalledWith('Subjects');

    expect((await findAllByText('Terlambat')).length).toBeGreaterThan(0);
  });

  it('offers the local-data footer and reset action', async () => {
    const { findByText, findByLabelText } = renderScreen(<DashboardScreen />);
    expect(await findByText(/AsistenKu \(AKU\)/)).toBeOnTheScreen();
    expect(await findByLabelText('Reset data contoh')).toBeOnTheScreen();
  });

  it('shows the uniform summary from the local dataset', async () => {
    const { findByText } = renderScreen(<DashboardScreen />);
    expect(await findByText('0/4 item lengkap')).toBeOnTheScreen();
  });
});

describe('duty screen', () => {
  it('lists duties and completes today\'s duty', async () => {
    const store = makeStore();
    const { findByText, findAllByText } = renderScreen(<DutyScreen />, store);

    expect(await findByText('Tandai selesai')).toBeOnTheScreen();
    fireEvent.press(await findByText('Tandai selesai'));

    await waitFor(() => {
      const duty = store.getState().data.duties.data.find((item) => item.status === 'COMPLETED');
      expect(duty).toBeTruthy();
    });
    expect((await findAllByText('Selesai')).length).toBeGreaterThan(0);
  });

  it('shows the empty state when the dataset has no duties', async () => {
    const dataset = createDemoDataset();
    const emptyStore = createStore({
      offline: {
        load: async () => ({ ...dataset, duties: [] }),
        save: async () => undefined,
        reset: async () => undefined,
      },
    });
    const { findByText } = renderScreen(<DutyScreen />, emptyStore);
    expect(await findByText('Belum ada jadwal piket')).toBeOnTheScreen();
  });
});

describe('homework screen', () => {
  it('flags late homework in red', async () => {
    const { findAllByText, findByText } = renderScreen(<HomeworkScreen />);
    expect(await findByText('Latihan pecahan halaman 42')).toBeOnTheScreen();
    expect((await findAllByText('Terlambat')).length).toBeGreaterThan(0);
  });
});

describe('exam screen', () => {
  it('shows the exam window and publication state', async () => {
    const { findByText } = renderScreen(<ExamScreen />);
    expect(await findByText('Ulangan harian Matematika')).toBeOnTheScreen();
    expect(await findByText('Terpublikasi')).toBeOnTheScreen();
    expect(await findByText(/07:30–09:00/)).toBeOnTheScreen();
    expect(await findByText('Draf')).toBeOnTheScreen();
  });
});

describe('subjects screen', () => {
  it('lists every mapel with its teacher', async () => {
    const { findByText, getAllByText } = renderScreen(<SubjectsScreen />);
    expect(await findByText('Matematika')).toBeOnTheScreen();
    expect(await findByText('IPA Terpadu')).toBeOnTheScreen();
    expect(await findByText('3 mapel · guru pengampu')).toBeOnTheScreen();
    expect(getAllByText('Sari Wulandari').length).toBe(3);
  });
});

describe('uniform screen', () => {
  it('toggles an item and updates progress', async () => {
    const store = makeStore();
    const { findByText, getByRole } = renderScreen(<UniformScreen />, store);

    expect(await findByText('Kemeja putih')).toBeOnTheScreen();
    fireEvent.press(getByRole('checkbox', { name: 'Dasi, Atribut' }));

    expect(await findByText('1/4 item selesai')).toBeOnTheScreen();
    expect(store.getState().data.uniform.data?.items.find((item) => item.key === 'tie')?.checked).toBe(
      true,
    );
  });

  it('explains holidays', async () => {
    const dataset = createDemoDataset();
    const store = createStore({
      offline: {
        load: async () => ({
          ...dataset,
          uniform: { ...dataset.uniform, date: today, items: [], completedCount: 0, total: 0, status: 'HOLIDAY', note: 'Libur semester' },
        }),
        save: async () => undefined,
        reset: async () => undefined,
      },
    });
    const { findByText } = renderScreen(<UniformScreen />, store);
    expect(await findByText('Hari libur')).toBeOnTheScreen();
    expect(await findByText('Libur semester')).toBeOnTheScreen();
  });
});

describe('root navigator', () => {
  it('opens straight on the tabs without a login step', async () => {
    const { findAllByText, findByText } = renderScreen(<RootNavigator />);
    expect(await findByText(/^Selamat (pagi|siang|sore|malam)$/)).toBeOnTheScreen();
    expect((await findAllByText('Seragam')).length).toBeGreaterThan(0);
    expect((await findAllByText('Piket')).length).toBeGreaterThan(0);
    expect((await findAllByText('Mapel')).length).toBeGreaterThan(0);
  });

  it('never renders an auth screen', () => {
    const { queryByText } = renderScreen(<RootNavigator />);
    expect(queryByText('Masuk')).toBeNull();
    expect(queryByText('Buat akun')).toBeNull();
  });
});
