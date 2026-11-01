import React, { useCallback, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { useAppDispatch, useAppSelector } from '../store';
import { completeDuty, loadDashboard, loadDuties } from '../store/dataSlice';
import { useTheme } from '../theme/ThemeProvider';
import { formatIndonesianDay, shiftLabel } from '../utils/format';
import { statusTone } from '../theme/tokens';

const DUTY_LABEL: Record<string, string> = {
  COMPLETED: 'Selesai',
  TODAY: 'Hari ini',
  UPCOMING: 'Terjadwal',
  OVERDUE: 'Terlewat',
};

export function DutyScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((state) => state.data.duties);

  const refresh = useCallback(() => {
    void dispatch(loadDuties());
  }, [dispatch]);

  const markDone = useCallback(
    async (id: string) => {
      await dispatch(completeDuty(id));
      // The dashboard card reflects today's duty, so refresh it too.
      void dispatch(loadDashboard());
    },
    [dispatch],
  );

  useEffect(() => {
    if (status === 'idle') refresh();
  }, [refresh, status]);

  return (
    <Screen
      title="Jadwal piket"
      subtitle="Piket kelasmu hari ini dan beberapa hari ke depan."
      refreshing={status === 'loading'}
      onRefresh={refresh}
    >
      {error ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          {error}
        </Text>
      ) : null}

      {status !== 'loading' && data.length === 0 ? (
        <EmptyState title="Belum ada jadwal piket" hint="Data contoh belum memuat jadwal piket." />
      ) : null}

      {data.map((duty) => {
        const tone = statusTone(theme, duty.completedAt ? 'COMPLETED' : duty.status);
        return (
          <Card
            key={duty.id}
            testID={`duty-${duty.id}`}
            title={formatIndonesianDay(duty.date)}
            subtitle={`Shift ${shiftLabel(duty.shift)}${duty.assignedStudentName ? ` · ${duty.assignedStudentName}` : ''}`}
            tone={tone.background}
            badge={{ label: DUTY_LABEL[duty.completedAt ? 'COMPLETED' : (duty.status ?? '')] ?? 'Terjadwal', color: tone.background }}
          >
            {duty.notes ? (
              <Text style={[styles.notes, { color: theme.colors.textMuted }]}>{duty.notes}</Text>
            ) : null}
            {duty.countdown ? (
              <Text style={[styles.notes, { color: theme.colors.textMuted }]}>
                {duty.countdown.isPast ? 'Sudah lewat' : `${duty.countdown.label} · ${duty.countdown.hours} jam lagi`}
              </Text>
            ) : null}
            {duty.canComplete ? (
              <View style={styles.action}>
                <PrimaryButton
                  label="Tandai selesai"
                  onPress={() => void markDone(duty.id)}
                  accessibilityHint="Menandai piket ini sudah dikerjakan"
                />
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  notes: { fontSize: 13, marginTop: 4 },
  action: { marginTop: 8 },
});
