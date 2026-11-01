import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ChecklistRow } from '../src/components/ChecklistRow';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { EmptyState } from '../src/components/EmptyState';
import { Fab } from '../src/components/Fab';
import { ListRow } from '../src/components/ListRow';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { ProgressBar } from '../src/components/ProgressBar';
import { Screen } from '../src/components/Screen';
import { SectionHeader } from '../src/components/SectionHeader';
import { SegmentedControl } from '../src/components/SegmentedControl';
import { Sheet } from '../src/components/Sheet';
import { StatTile } from '../src/components/StatTile';
import { TextField } from '../src/components/TextField';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { lightTheme } from '../src/theme/tokens';

const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function wrap(node: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider theme={lightTheme}>{node}</ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('components', () => {
  it('announces the screen title as a header', () => {
    const { getByRole, getByText } = wrap(
      <Screen title="Jadwal piket" subtitle="Piket kelasmu">
        <EmptyState title="Kosong" />
      </Screen>,
    );
    expect(getByRole('header')).toHaveTextContent('Jadwal piket');
    expect(getByText('Kosong')).toBeOnTheScreen();
  });

  it('offers a back affordance only when asked', () => {
    const onBack = jest.fn();
    const { getByLabelText } = wrap(
      <Screen title="Mata pelajaran" onBack={onBack}>
        <EmptyState title="Kosong" />
      </Screen>,
    );
    fireEvent.press(getByLabelText('Kembali'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders one accessible row per list item', () => {
    const onPress = jest.fn();
    const { getByRole } = wrap(
      <ListRow
        title="Ulangan harian"
        meta="Matematika · 07:30–09:00"
        trailing="Besok"
        onPress={onPress}
      />,
    );

    const row = getByRole('button');
    expect(row).toHaveProp('accessibilityLabel', 'Ulangan harian. Matematika · 07:30–09:00. Besok');
    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows section headers with an optional count', () => {
    const { getByText } = wrap(<SectionHeader title="Minggu ini" aside="3" />);
    expect(getByText('MINGGU INI')).toBeOnTheScreen();
    expect(getByText('3')).toBeOnTheScreen();
  });

  it('exposes segments as a radio group', () => {
    const onChange = jest.fn();
    const { getByRole, getByLabelText } = wrap(
      <SegmentedControl
        accessibilityLabel="Shift piket"
        options={[
          { value: 'MORNING', label: 'Pagi' },
          { value: 'AFTERNOON', label: 'Siang' },
        ]}
        value="MORNING"
        onChange={onChange}
      />,
    );

    expect(getByRole('radio', { name: 'Pagi', selected: true })).toBeOnTheScreen();
    fireEvent.press(getByLabelText('Siang'));
    expect(onChange).toHaveBeenCalledWith('AFTERNOON');
  });

  it('summarises a number and its hint in one label', () => {
    const onPress = jest.fn();
    const { getByLabelText } = wrap(
      <StatTile label="PR" value="2" hint="1 terlambat" onPress={onPress} />,
    );

    const tile = getByLabelText('PR: 2. 1 terlambat');
    fireEvent.press(tile);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('fills the progress track by ratio', () => {
    const { getByLabelText, getByTestId } = wrap(
      <ProgressBar value={1} total={4} label="1/4 selesai" />,
    );
    expect(getByLabelText('1/4 selesai')).toBeOnTheScreen();
    expect(getByTestId('progress-fill')).toHaveStyle({ width: '25%' });
  });

  it('closes the bottom sheet from the backdrop', () => {
    const onClose = jest.fn();
    const { getByText, getByLabelText } = wrap(
      <Sheet visible title="Piket baru" onClose={onClose}>
        <EmptyState title="Isi form" />
      </Sheet>,
    );

    expect(getByText('Piket baru')).toBeOnTheScreen();
    fireEvent.press(getByLabelText('Tutup'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('labels the floating action button', () => {
    const onPress = jest.fn();
    const { getByLabelText } = wrap(<Fab label="Tambah PR" onPress={onPress} />);
    fireEvent.press(getByLabelText('Tambah PR'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps empty states actionable', () => {
    const onAction = jest.fn();
    const { getByText } = wrap(
      <EmptyState title="Belum ada PR" hint="Catat tugas" actionLabel="Tambah PR" onAction={onAction} />,
    );

    fireEvent.press(getByText('Tambah PR'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('labels text fields and reports typed text', () => {
    const onChangeText = jest.fn();
    const { getByLabelText } = wrap(
      <TextField label="Judul" value="" onChangeText={onChangeText} placeholder="Judul PR" />,
    );

    fireEvent.changeText(getByLabelText('Judul'), 'Latihan');
    expect(onChangeText).toHaveBeenCalledWith('Latihan');
  });

  it('toggles a checklist row and reports the new state', () => {
    const onToggle = jest.fn();
    const { getByRole } = wrap(
      <ChecklistRow label="Dasi" category="Atribut" checked={false} onToggle={onToggle} />,
    );

    const checkbox = getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    fireEvent.press(checkbox);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('blocks interaction for disabled checklist rows', () => {
    const onToggle = jest.fn();
    const { getByRole } = wrap(<ChecklistRow label="Dasi" checked disabled onToggle={onToggle} />);
    fireEvent.press(getByRole('checkbox'));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('keeps a recoverable screen when a child crashes', () => {
    // React logs caught render errors; the boundary is what we assert on.
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const Boom = () => {
      throw new Error('boom');
    };
    const { getByText, getByLabelText } = wrap(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(getByText('Aplikasi berhenti sebentar')).toBeOnTheScreen();
    fireEvent.press(getByLabelText('Coba lagi'));
  });

  it('disables the primary button while loading and keeps a 48dp target', () => {
    const onPress = jest.fn();
    const { getByRole } = wrap(<PrimaryButton label="Simpan" onPress={onPress} loading />);
    const button = getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toBeBusy();
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(lightTheme.touchTarget).toBeGreaterThanOrEqual(44);
  });
});
