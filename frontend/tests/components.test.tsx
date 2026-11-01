import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { Card } from '../src/components/Card';
import { ChecklistRow } from '../src/components/ChecklistRow';
import { EmptyState } from '../src/components/EmptyState';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { StatusBadge } from '../src/components/StatusBadge';
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
      <Screen title="Jadwal piket" subtitle="H-1">
        <EmptyState title="Kosong" />
      </Screen>,
    );
    expect(getByRole('header')).toHaveTextContent('Jadwal piket');
    expect(getByText('Kosong')).toBeOnTheScreen();
  });

  it('exposes the card as a single button with its badge in the label', () => {
    const onPress = jest.fn();
    const { getByRole } = wrap(
      <Card
        title="Piket hari ini"
        subtitle="Shift pagi"
        badge={{ label: 'Hari ini', color: '#F39C12' }}
        onPress={onPress}
        accessibilityHint="Membuka piket"
      />,
    );

    const card = getByRole('button');
    expect(card).toHaveProp('accessibilityLabel', 'Piket hari ini. Shift pagi. Status Hari ini');
    fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not create a button when the card is not pressable', () => {
    const { queryByRole, getByText } = wrap(<Card title="Informasi" subtitle="Statis" />);
    expect(queryByRole('button')).toBeNull();
    expect(getByText('Informasi')).toBeOnTheScreen();
  });

  it('renders status badges with the required colour coding', () => {
    const done = wrap(<StatusBadge status="COMPLETED" label="Selesai" />);
    expect(done.getByLabelText('Status Selesai')).toBeOnTheScreen();

    const overdue = wrap(<StatusBadge status="OVERDUE" label="Terlambat" />);
    expect(overdue.getByLabelText('Status Terlambat')).toBeOnTheScreen();
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
    const { getByRole } = wrap(
      <ChecklistRow label="Dasi" checked disabled onToggle={onToggle} />,
    );
    fireEvent.press(getByRole('checkbox'));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('disables the primary button while loading and keeps a 48dp target', () => {
    const onPress = jest.fn();
    const { getByRole, rerender } = wrap(
      <PrimaryButton label="Masuk" onPress={onPress} loading />,
    );
    const button = getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toBeBusy();
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();

    rerender(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider theme={lightTheme}>
          <PrimaryButton label="Masuk" onPress={onPress} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(lightTheme.touchTarget).toBeGreaterThanOrEqual(44);
  });
});
