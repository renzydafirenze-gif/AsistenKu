import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { DashboardScreen } from '../src/screens/DashboardScreen';
import { DutyScreen } from '../src/screens/DutyScreen';
import { ExamScreen } from '../src/screens/ExamScreen';
import { HomeworkScreen } from '../src/screens/HomeworkScreen';
import { SubjectsScreen } from '../src/screens/SubjectsScreen';
import { UniformScreen } from '../src/screens/UniformScreen';
import { RootNavigator } from '../src/navigation/RootNavigator';
import { createDemoDataset, createEmptyDataset } from '../src/offline/seed';
import { createOfflineStorage, DATASET_KEY } from '../src/offline/storage';
import { createStore, type AppStore } from '../src/store';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { lightTheme } from '../src/theme/tokens';
import { addDaysKey, formatDateKey, formatIndonesianDate } from '../src/utils/format';
import { groupByDay } from '../src/utils/group';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function memoryBackend(initial?: Record<string, string>) {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
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

/** Screens run against the real store with example data already on disk. */
function makeStore(demo = true): AppStore {
  const dataset = demo ? createDemoDataset() : createEmptyDataset();
  const backend = memoryBackend({ [DATASET_KEY]: JSON.stringify(dataset) });
  return createStore({ offline: createOfflineStorage(backend) });
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

/** Auto-confirms the non-cancel button of a native Alert. */
function autoConfirmAlert() {
  return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.style !== 'cancel')?.onPress?.();
  });
}

const today = formatDateKey(new Date());

afterEach(() => {
  jest.restoreAllMocks();
});

describe('dashboard screen', () => {
  it('shows the greeting, stat tiles and today agenda', async () => {
    const { findByText, findByTestId, getByTestId } = renderScreen(<DashboardScreen />);

    expect(await findByText(/^Selamat (pagi|siang|sore|malam)$/)).toBeOnTheScreen();
    expect(await findByText(`Ani Lestari · ${formatIndonesianDate(today)}`)).toBeOnTheScreen();

    // Today's example duty, its late homework and the next exam shape the tiles.
    expect(await findByTestId('stat-duty')).toBeOnTheScreen();
    expect(getByTestId('stat-homework')).toBeOnTheScreen();
    expect(getByTestId('stat-exam')).toBeOnTheScreen();
  });

  it('navigates to a tab from a stat tile and to Mapel from Kelola', async () => {
    const { findByTestId } = renderScreen(<DashboardScreen />);

    fireEvent.press(await findByTestId('stat-homework'));
    expect(mockNavigate).toHaveBeenCalledWith('Homework');

    fireEvent.press(await findByTestId('dashboard-link-subjects'));
    expect(mockNavigate).toHaveBeenCalledWith('Subjects');
  });

  it('renames the student from the settings sheet', async () => {
    const store = makeStore(false);
    const { findByText, findByTestId, findByLabelText } = renderScreen(<DashboardScreen />, store);

    fireEvent.press(await findByLabelText('Pengaturan'));
    fireEvent.changeText(await findByTestId('profile-name'), 'Budi');

    await act(async () => {
      fireEvent.press(await findByText('Simpan nama'));
    });

    await waitFor(() => expect(store.getState().data.dashboard.data?.user.fullName).toBe('Budi'));
  });

  it('clears all data and reloads the example set from settings', async () => {
    autoConfirmAlert();
    const store = makeStore();
    const { findByText, findByLabelText } = renderScreen(<DashboardScreen />, store);

    fireEvent.press(await findByLabelText('Pengaturan'));
    await act(async () => {
      fireEvent.press(await findByText('Kosongkan semua data'));
    });
    await waitFor(() => expect(store.getState().data.duties.data).toEqual([]));

    fireEvent.press(await findByLabelText('Pengaturan'));
    await act(async () => {
      fireEvent.press(await findByText('Muat data contoh'));
    });
    await waitFor(() => expect(store.getState().data.duties.data).toHaveLength(3));
  });

  it('reports a validation failure when the name is blank', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const store = makeStore();
    const { findByText, findByLabelText, findByTestId } = renderScreen(<DashboardScreen />, store);

    fireEvent.press(await findByLabelText('Pengaturan'));
    fireEvent.changeText(await findByTestId('profile-name'), '   ');
    await act(async () => {
      fireEvent.press(await findByText('Simpan nama'));
    });

    expect(alertSpy).toHaveBeenCalledWith('Gagal menyimpan', 'Nama wajib diisi.');
  });
});

describe('duty screen', () => {
  it('groups duties and shows an Indonesian status', async () => {
    const { findByText, findByTestId } = renderScreen(<DutyScreen />);

    expect(await findByText('HARI INI')).toBeOnTheScreen();
    expect(await findByText('TERLEWAT')).toBeOnTheScreen();
    expect(await findByTestId('duty-duty-today')).toBeOnTheScreen();
  });

  it('creates a duty from the bottom sheet', async () => {
    const store = makeStore(false);
    const { findByText, findByTestId, findByLabelText } = renderScreen(<DutyScreen />, store);

    expect(await findByText('Belum ada jadwal piket')).toBeOnTheScreen();
    fireEvent.press(await findByLabelText('Tambah piket'));

    fireEvent.changeText(await findByTestId('duty-date'), today);
    fireEvent.changeText(await findByTestId('duty-student'), 'Ani');
    fireEvent.changeText(await findByTestId('duty-notes'), 'Sapu lantai');

    await act(async () => {
      fireEvent.press(await findByText('Simpan piket'));
    });

    await waitFor(() => expect(store.getState().data.duties.data).toHaveLength(1));
    expect(await findByText('Sapu lantai')).toBeOnTheScreen();
  });

  it('switches the shift segment and surfaces validation errors', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const store = makeStore(false);
    const { findByText, findByTestId, findByLabelText } = renderScreen(<DutyScreen />, store);

    fireEvent.press(await findByLabelText('Tambah piket'));
    fireEvent.press(await findByLabelText('Siang'));
    fireEvent.changeText(await findByTestId('duty-date'), '01-11-2026');
    fireEvent.changeText(await findByTestId('duty-student'), 'Beni');

    await act(async () => {
      fireEvent.press(await findByText('Simpan piket'));
    });

    expect(alertSpy).toHaveBeenCalledWith('Gagal menyimpan', 'Tanggal harus berformat YYYY-MM-DD.');
    expect(store.getState().data.duties.data).toEqual([]);
  });

  it('opens a duty, completes it and deletes another one', async () => {
    autoConfirmAlert();
    const store = makeStore();
    const { findByText, findByTestId } = renderScreen(<DutyScreen />, store);

    fireEvent.press(await findByTestId('duty-duty-today'));
    await act(async () => {
      fireEvent.press(await findByText('Tandai selesai'));
    });
    await waitFor(() =>
      expect(store.getState().data.duties.data.find((duty) => duty.id === 'duty-today')?.status).toBe(
        'COMPLETED',
      ),
    );

    fireEvent.press(await findByTestId('duty-duty-tomorrow'));
    fireEvent.press(await findByText('Hapus'));
    await waitFor(() => expect(store.getState().data.duties.data).toHaveLength(2));
  });
});

describe('homework screen', () => {
  it('groups late work first and hides delete for it', async () => {
    const { findByText, findByTestId } = renderScreen(<HomeworkScreen />);

    expect(await findByText('TERLEWAT')).toBeOnTheScreen();
    expect(await findByText('Latihan pecahan halaman 42')).toBeOnTheScreen();

    fireEvent.press(await findByTestId('homework-hw-late'));
    // Late work explains itself instead of offering Hapus.
    expect(
      await findByText('PR terlambat tidak bisa dihapus. Ubah tenggatnya kalau memang salah input.'),
    ).toBeOnTheScreen();
  });

  it('marks homework done', async () => {
    const store = makeStore();
    const { findByText, findByTestId } = renderScreen(<HomeworkScreen />, store);

    fireEvent.press(await findByTestId('homework-hw-upcoming'));
    await act(async () => {
      fireEvent.press(await findByText('Tandai selesai'));
    });

    await waitFor(() =>
      expect(
        store.getState().data.homework.data.find((item) => item.id === 'hw-upcoming')?.assignment
          ?.status,
      ).toBe('SUBMITTED'),
    );
  });

  it('adds homework from the sheet', async () => {
    const store = makeStore(false);
    const { findByText, findByTestId, findByLabelText } = renderScreen(<HomeworkScreen />, store);

    fireEvent.press(await findByLabelText('Tambah PR'));
    fireEvent.changeText(await findByTestId('homework-title'), 'Ringkasan cerpen');
    fireEvent.changeText(await findByTestId('homework-subject'), 'Bahasa Indonesia');
    fireEvent.changeText(await findByTestId('homework-due'), addDaysKey(today, 2));

    await act(async () => {
      fireEvent.press(await findByText('Simpan PR'));
    });

    await waitFor(() => expect(store.getState().data.homework.data).toHaveLength(1));
    expect(await findByText('Ringkasan cerpen')).toBeOnTheScreen();
  });
});

describe('exam screen', () => {
  it('publishes a draft and blocks later edits', async () => {
    autoConfirmAlert();
    const store = makeStore();
    const { findByText, findByTestId } = renderScreen(<ExamScreen />, store);

    fireEvent.press(await findByTestId('exam-exam-ipa'));
    await act(async () => {
      fireEvent.press(await findByText('Publikasikan'));
    });

    await waitFor(() =>
      expect(store.getState().data.exams.data.find((exam) => exam.id === 'exam-ipa')?.isLocked).toBe(
        true,
      ),
    );

    // The locked sheet only reports the lock and cannot edit.
    fireEvent.press(await findByTestId('exam-exam-ipa'));
    expect(await findByText(/Terkunci setelah dipublikasikan/)).toBeOnTheScreen();
  });

  it('adds an exam from the sheet', async () => {
    const store = makeStore(false);
    const { findByText, findByTestId, findByLabelText } = renderScreen(<ExamScreen />, store);

    fireEvent.press(await findByLabelText('Tambah ujian'));
    fireEvent.changeText(await findByTestId('exam-title'), 'UTS IPA');
    fireEvent.changeText(await findByTestId('exam-subject'), 'IPA');
    fireEvent.changeText(await findByTestId('exam-date'), addDaysKey(today, 5));
    fireEvent.changeText(await findByTestId('exam-room'), 'Lab');

    await act(async () => {
      fireEvent.press(await findByText('Simpan ujian'));
    });

    await waitFor(() => expect(store.getState().data.exams.data).toHaveLength(1));
    expect(await findByText('UTS IPA')).toBeOnTheScreen();
  });
});

describe('subjects screen', () => {
  it('lists mapel alphabetically, adds one and goes back', async () => {
    const store = makeStore();
    const { findByText, findByTestId, findByLabelText, getAllByText } = renderScreen(
      <SubjectsScreen />,
      store,
    );

    expect(await findByText('Matematika')).toBeOnTheScreen();
    expect(getAllByText('Sari Wulandari').length).toBe(3);

    fireEvent.press(await findByLabelText('Tambah mapel'));
    fireEvent.changeText(await findByTestId('subject-name'), 'Sejarah');
    fireEvent.changeText(await findByTestId('subject-code'), 'sej');
    await act(async () => {
      fireEvent.press(await findByText('Simpan mapel'));
    });
    await waitFor(() => expect(store.getState().data.subjects.data).toHaveLength(4));
    expect(await findByText('Sejarah')).toBeOnTheScreen();

    fireEvent.press(await findByLabelText('Kembali'));
    expect(mockGoBack).toHaveBeenCalled();
  });
});

describe('uniform screen', () => {
  it('groups items by category and toggles one', async () => {
    const store = makeStore();
    const { findByText, getByRole, getByLabelText } = renderScreen(<UniformScreen />, store);

    expect(await findByText('ATASAN')).toBeOnTheScreen();
    expect(await findByText('ALAS KAKI')).toBeOnTheScreen();
    expect(getByLabelText('0/4 selesai')).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(getByRole('checkbox', { name: 'Dasi, Atribut' }));
    });

    expect(await findByText('1/4 selesai')).toBeOnTheScreen();
  });

  it('explains holidays', async () => {
    const dataset = createDemoDataset();
    const backend = memoryBackend({
      [DATASET_KEY]: JSON.stringify({
        ...dataset,
        uniform: {
          ...dataset.uniform,
          items: [],
          completedCount: 0,
          total: 0,
          status: 'HOLIDAY',
          note: 'Libur semester',
        },
      }),
    });
    const store = createStore({ offline: createOfflineStorage(backend) });
    const { findByText } = renderScreen(<UniformScreen />, store);

    expect(await findByText('Hari libur')).toBeOnTheScreen();
    expect(await findByText('Libur semester')).toBeOnTheScreen();
  });
});

describe('empty states', () => {
  it('guides the user on every list screen', async () => {
    const store = makeStore(false);

    expect(await renderScreen(<DutyScreen />, store).findByText('Belum ada jadwal piket')).toBeOnTheScreen();
    expect(await renderScreen(<HomeworkScreen />, store).findByText('Belum ada PR')).toBeOnTheScreen();
    expect(await renderScreen(<ExamScreen />, store).findByText('Belum ada ujian')).toBeOnTheScreen();
    expect(
      await renderScreen(<SubjectsScreen />, store).findByText('Belum ada mata pelajaran'),
    ).toBeOnTheScreen();
  });
});

describe('root navigator', () => {
  it('opens straight on five tabs without a login step', async () => {
    const { findAllByText, findByText, queryByText } = renderScreen(<RootNavigator />);

    expect(await findByText(/^Selamat (pagi|siang|sore|malam)$/)).toBeOnTheScreen();
    expect((await findAllByText('Piket')).length).toBeGreaterThan(0);
    expect((await findAllByText('Seragam')).length).toBeGreaterThan(0);
    expect(queryByText('Mapel')).toBeNull();
    expect(queryByText('Masuk')).toBeNull();
  });
});

describe('list grouping', () => {
  it('buckets rows into relative day sections', () => {
    const groups = groupByDay(today, [
      { id: 'late', date: addDaysKey(today, -2) },
      { id: 'today', date: today },
      { id: 'tomorrow', date: addDaysKey(today, 1) },
      { id: 'week', date: addDaysKey(today, 4) },
      { id: 'later', date: addDaysKey(today, 30) },
    ], (item) => item.date);

    expect(groups.map((group) => group.title)).toEqual([
      'Terlewat',
      'Hari ini',
      'Besok',
      'Minggu ini',
      'Berikutnya',
    ]);
  });
});
