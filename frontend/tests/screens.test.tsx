import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { DashboardScreen } from '../src/screens/DashboardScreen';
import { DutyScreen } from '../src/screens/DutyScreen';
import { ExamScreen } from '../src/screens/ExamScreen';
import { HomeworkScreen } from '../src/screens/HomeworkScreen';
import { UniformScreen } from '../src/screens/UniformScreen';
import { SubjectsScreen } from '../src/screens/SubjectsScreen';
import { RootNavigator } from '../src/navigation/RootNavigator';
import { createDemoDataset, createEmptyDataset } from '../src/offline/seed';
import { createOfflineStorage, DATASET_KEY } from '../src/offline/storage';
import { createStore, type AppStore } from '../src/store';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { lightTheme } from '../src/theme/tokens';
import { addDaysKey, formatDateKey, formatIndonesianDay } from '../src/utils/format';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
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

/** Screens are exercised against the real store with example data on disk. */
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

/** Auto-confirms the destructive/primary button of a native Alert. */
function autoConfirmAlert() {
  return jest
    .spyOn(Alert, 'alert')
    .mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.style !== 'cancel')?.onPress?.();
    });
}

const today = formatDateKey(new Date());

afterEach(() => {
  jest.restoreAllMocks();
});

describe('dashboard screen', () => {
  it('renders the greeting, cards and navigates by tab', async () => {
    const { findByText, findAllByText, getByTestId } = renderScreen(<DashboardScreen />);

    expect(await findByText(/^Selamat (pagi|siang|sore|malam)$/)).toBeOnTheScreen();
    expect(await findByText(`Ani Lestari · ${formatIndonesianDay(today)}`)).toBeOnTheScreen();

    fireEvent.press(getByTestId('dashboard-card-duty'));
    expect(mockNavigate).toHaveBeenCalledWith('Duty');

    fireEvent.press(getByTestId('dashboard-card-subjects'));
    expect(mockNavigate).toHaveBeenCalledWith('Subjects');

    expect((await findAllByText('Terlambat')).length).toBeGreaterThan(0);
  });

  it('opens settings so the user can rename and manage data', async () => {
    const store = makeStore(false);
    const { findByText, findByTestId, findByLabelText } = renderScreen(<DashboardScreen />, store);

    fireEvent.press(await findByLabelText('Pengaturan'));

    expect(await findByText('Pengaturan')).toBeOnTheScreen();
    const nameField = await findByTestId('profile-name');
    fireEvent.changeText(nameField, 'Budi');

    await act(async () => {
      fireEvent.press(await findByText('Simpan nama'));
    });

    await waitFor(() => expect(store.getState().data.dashboard.data?.user.fullName).toBe('Budi'));
  });
});

describe('duty screen', () => {
  it('creates a new duty from the form', async () => {
    const store = makeStore(false);
    const { findByText, findByTestId } = renderScreen(<DutyScreen />, store);

    expect(await findByText('Belum ada jadwal piket')).toBeOnTheScreen();
    fireEvent.press(await findByText('Tambah piket'));

    fireEvent.changeText(await findByTestId('duty-date'), today);
    fireEvent.changeText(await findByTestId('duty-student'), 'Ani');
    fireEvent.changeText(await findByTestId('duty-notes'), 'Sapu lantai');

    await act(async () => {
      fireEvent.press(await findByText('Simpan piket'));
    });

    await waitFor(() => expect(store.getState().data.duties.data).toHaveLength(1));
    expect(await findByText('Sapu lantai')).toBeOnTheScreen();
    expect(await findByText('Hari ini')).toBeOnTheScreen();
  });

  it('completes a duty from the example data', async () => {
    const store = makeStore();
    const { findByText, findAllByText } = renderScreen(<DutyScreen />, store);

    await act(async () => {
      fireEvent.press(await findByText('Tandai selesai'));
    });

    await waitFor(() =>
      expect(store.getState().data.duties.data.some((duty) => duty.status === 'COMPLETED')).toBe(true),
    );
    expect((await findAllByText('Selesai')).length).toBeGreaterThan(0);
  });
});

describe('homework screen', () => {
  it('flags late homework and blocks deleting it', async () => {
    const { findAllByText, findAllByLabelText, findByText } = renderScreen(<HomeworkScreen />);

    expect(await findByText('Latihan pecahan halaman 42')).toBeOnTheScreen();
    expect((await findAllByText('Terlambat')).length).toBeGreaterThan(0);

    // The late card sorts first; its Hapus button is disabled.
    const [firstDelete] = await findAllByLabelText('Hapus');
    expect(firstDelete).toBeDisabled();
  });

  it('marks a task done and keeps late work flagged', async () => {
    const store = makeStore();
    const { findByText, findAllByText } = renderScreen(<HomeworkScreen />, store);

    const [firstButton] = await findAllByText('Tandai selesai');
    await act(async () => {
      fireEvent.press(firstButton!);
    });

    expect(await findByText('Dikumpulkan terlambat')).toBeOnTheScreen();
    await waitFor(() => expect(store.getState().data.homework.data[0]?.isLate).toBe(true));
  });

  it('adds homework from the form', async () => {
    const store = makeStore(false);
    const { findByText, findByTestId } = renderScreen(<HomeworkScreen />, store);

    fireEvent.press(await findByText('Tambah PR'));
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
  it('publishes a draft and locks it afterwards', async () => {
    autoConfirmAlert();
    const store = makeStore();
    const { findByText, findAllByText, queryByText } = renderScreen(<ExamScreen />, store);

    expect(await findByText('Draf')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(await findByText('Publikasikan'));
    });

    await waitFor(() => expect(store.getState().data.exams.data.some((exam) => exam.isLocked)).toBe(true));
    // The example data already has one published exam, so two locks show up.
    expect((await findAllByText('Terkunci setelah dipublikasikan.')).length).toBe(2);
    expect(queryByText('Draf')).toBeNull();
  });

  it('adds an exam from the form', async () => {
    const store = makeStore(false);
    const { findByText, findByTestId } = renderScreen(<ExamScreen />, store);

    fireEvent.press(await findByText('Tambah ujian'));
    fireEvent.changeText(await findByTestId('exam-title'), 'UTS IPA');
    fireEvent.changeText(await findByTestId('exam-subject'), 'IPA');
    fireEvent.changeText(await findByTestId('exam-date'), addDaysKey(today, 5));

    await act(async () => {
      fireEvent.press(await findByText('Simpan ujian'));
    });

    await waitFor(() => expect(store.getState().data.exams.data).toHaveLength(1));
    expect(await findByText('UTS IPA')).toBeOnTheScreen();
  });
});

describe('subjects screen', () => {
  it('lists mapel and adds a new one', async () => {
    const store = makeStore();
    const { findByText, findByTestId, getAllByText } = renderScreen(<SubjectsScreen />, store);

    expect(await findByText('Matematika')).toBeOnTheScreen();
    expect(getAllByText('Sari Wulandari').length).toBe(3);

    fireEvent.press(await findByText('Tambah mapel'));
    fireEvent.changeText(await findByTestId('subject-name'), 'Sejarah');
    fireEvent.changeText(await findByTestId('subject-code'), 'sej');

    await act(async () => {
      fireEvent.press(await findByText('Simpan mapel'));
    });

    await waitFor(() => expect(store.getState().data.subjects.data).toHaveLength(4));
    expect(await findByText('Sejarah')).toBeOnTheScreen();
  });
});

describe('uniform screen', () => {
  it('toggles an item and updates progress', async () => {
    const store = makeStore();
    const { findByText, getByRole } = renderScreen(<UniformScreen />, store);

    expect(await findByText('Kemeja putih')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(getByRole('checkbox', { name: 'Dasi, Atribut' }));
    });

    expect(await findByText('1/4 item selesai')).toBeOnTheScreen();
    await waitFor(() => expect(store.getState().data.dashboard.data).not.toBeNull());
  });
});

describe('editing flows', () => {
  it('edits and deletes a duty', async () => {
    autoConfirmAlert();
    const store = makeStore();
    const { findByTestId, findByText } = renderScreen(<DutyScreen />, store);

    const card = await findByTestId('duty-duty-tomorrow');
    fireEvent.press(within(card).getByText('Ubah'));
    fireEvent.changeText(await findByTestId('duty-notes'), 'Siram tanaman');

    await act(async () => {
      fireEvent.press(await findByText('Simpan piket'));
    });
    await waitFor(() =>
      expect(
        store.getState().data.duties.data.find((duty) => duty.id === 'duty-tomorrow')?.notes,
      ).toBe('Siram tanaman'),
    );

    fireEvent.press(within(await findByTestId('duty-duty-tomorrow')).getByText('Hapus'));
    await waitFor(() => expect(store.getState().data.duties.data).toHaveLength(2));
  });

  it('cancels a duty form without saving', async () => {
    const store = makeStore(false);
    const { findByText } = renderScreen(<DutyScreen />, store);

    fireEvent.press(await findByText('Tambah piket'));
    fireEvent.press(await findByText('Batal'));

    expect(await findByText('Belum ada jadwal piket')).toBeOnTheScreen();
    expect(store.getState().data.duties.data).toEqual([]);
  });

  it('surfaces a validation error from the duty form', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const store = makeStore(false);
    const { findByText, findByTestId } = renderScreen(<DutyScreen />, store);

    fireEvent.press(await findByText('Tambah piket'));
    fireEvent.changeText(await findByTestId('duty-date'), '01-11-2026');
    await act(async () => {
      fireEvent.press(await findByText('Simpan piket'));
    });

    expect(alertSpy).toHaveBeenCalledWith('Gagal menyimpan', 'Tanggal harus berformat YYYY-MM-DD.');
    expect(store.getState().data.duties.data).toEqual([]);
  });

  it('switches the duty shift and refreshes manually', async () => {
    const store = makeStore(false);
    const { findByText, findByTestId } = renderScreen(<DutyScreen />, store);

    fireEvent.press(await findByText('Tambah piket'));
    fireEvent.press(await findByText('Siang'));
    fireEvent.changeText(await findByTestId('duty-student'), 'Beni');
    await act(async () => {
      fireEvent.press(await findByText('Simpan piket'));
    });

    await waitFor(() => expect(store.getState().data.duties.data[0]?.shift).toBe('AFTERNOON'));
    await act(async () => {
      fireEvent.press(await findByText('Muat ulang'));
    });
    expect(store.getState().data.duties.data).toHaveLength(1);
  });

  it('edits and deletes on-time homework', async () => {
    autoConfirmAlert();
    const store = makeStore();
    const { findByTestId, findByText } = renderScreen(<HomeworkScreen />, store);

    const card = await findByTestId('homework-hw-ipa');
    fireEvent.press(within(card).getByText('Ubah'));
    fireEvent.changeText(await findByTestId('homework-title'), 'Laporan praktikum (revisi)');
    await act(async () => {
      fireEvent.press(await findByText('Simpan PR'));
    });
    await waitFor(() =>
      expect(store.getState().data.homework.data.some((item) => item.title.includes('revisi'))).toBe(
        true,
      ),
    );

    fireEvent.press(within(await findByTestId('homework-hw-ipa')).getByText('Hapus'));
    await waitFor(() => expect(store.getState().data.homework.data).toHaveLength(2));
  });

  it('edits and deletes a draft exam', async () => {
    autoConfirmAlert();
    const store = makeStore();
    const { findByTestId, findByText } = renderScreen(<ExamScreen />, store);

    const card = await findByTestId('exam-exam-ipa');
    fireEvent.press(within(card).getByText('Ubah'));
    fireEvent.changeText(await findByTestId('exam-room'), 'Lab Baru');
    await act(async () => {
      fireEvent.press(await findByText('Simpan ujian'));
    });
    await waitFor(() =>
      expect(store.getState().data.exams.data.find((exam) => exam.id === 'exam-ipa')?.room).toBe(
        'Lab Baru',
      ),
    );

    fireEvent.press(within(await findByTestId('exam-exam-ipa')).getByText('Hapus'));
    await waitFor(() => expect(store.getState().data.exams.data).toHaveLength(1));
  });

  it('edits and deletes a subject', async () => {
    autoConfirmAlert();
    const store = makeStore();
    const { findByTestId, findByText } = renderScreen(<SubjectsScreen />, store);

    const card = await findByTestId('subject-subject-bin');
    fireEvent.press(within(card).getByText('Ubah'));
    fireEvent.changeText(await findByTestId('subject-name'), 'B. Indonesia');
    await act(async () => {
      fireEvent.press(await findByText('Simpan mapel'));
    });
    await waitFor(() =>
      expect(store.getState().data.subjects.data.some((item) => item.name === 'B. Indonesia')).toBe(
        true,
      ),
    );

    fireEvent.press(within(await findByTestId('subject-subject-bin')).getByText('Hapus'));
    await waitFor(() => expect(store.getState().data.subjects.data).toHaveLength(2));
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

  it('reports a storage failure when the profile name is empty', async () => {
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

describe('empty and holiday states', () => {
  it('shows holiday copy on the uniform screen', async () => {
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

  it('shows empty copy on every list screen', async () => {
    const store = makeStore(false);
    const duty = renderScreen(<DutyScreen />, store);
    expect(await duty.findByText('Belum ada jadwal piket')).toBeOnTheScreen();

    const homework = renderScreen(<HomeworkScreen />, store);
    expect(await homework.findByText('Belum ada PR')).toBeOnTheScreen();

    const exams = renderScreen(<ExamScreen />, store);
    expect(await exams.findByText('Belum ada ujian')).toBeOnTheScreen();

    const subjects = renderScreen(<SubjectsScreen />, store);
    expect(await subjects.findByText('Belum ada mata pelajaran')).toBeOnTheScreen();
  });
});

describe('root navigator', () => {
  it('opens straight on the tabs without a login step', async () => {
    const { findAllByText, findByText } = renderScreen(<RootNavigator />);
    expect(await findByText(/^Selamat (pagi|siang|sore|malam)$/)).toBeOnTheScreen();
    expect((await findAllByText('Mapel')).length).toBeGreaterThan(0);
    expect((await findAllByText('Piket')).length).toBeGreaterThan(0);
  });

  it('never renders an auth screen', () => {
    const { queryByText } = renderScreen(<RootNavigator />);
    expect(queryByText('Masuk')).toBeNull();
    expect(queryByText('Buat akun')).toBeNull();
  });
});
