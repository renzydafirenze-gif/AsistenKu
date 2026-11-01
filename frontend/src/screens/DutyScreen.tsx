import React, { useCallback, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { StatusBadge } from '../components/StatusBadge';
import { useAppDispatch, useAppSelector } from '../store';
import { completeDuty, loadDuties } from '../store/dataSlice';
import { useTheme } from '../theme/ThemeProvider';
import { formatIndonesianDay, shiftLabel } from '../utils/format';
import { statusTone } from '../theme/tokens';

export function DutyScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((state) => state.data.duties);

  const refresh = useCallback(() => {
    void dispatch(loadDuties());
  }, [dispatch]);

  useEffect(() => {
    if (status === 'idle') refresh();
  }, [refresh, status]);

  return (
    <Screen
      title="Jadwal piket"
      subtitle="H-1 pengingat dikirim hanya ke siswa yang bertugas."
      refreshing={status === 'loading'}
      onRefresh={refresh}
    >
      {error ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          {error}
        </Text>
      ) : null}

      {status !== 'loading' && data.length === 0 ? (
        <EmptyState title="Belum ada jadwal piket" hint="Jadwal muncul setelah guru membagikannya." />
      ) : null}

      {data.map((duty) => {
        const tone = statusTone(theme, duty.status);
        return (
          <Card
            key={duty.id}
            testID={`duty-${duty.id}`}
            title={formatIndonesianDay(duty.date)}
            subtitle={`Shift ${shiftLabel(duty.shift)}${duty.assignedStudentName ? ` · ${duty.assignedStudentName}` : ''}`}
            tone={tone.background}
            badge={duty.status ? { label: duty.status, color: tone.background } : undefined}
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
                  onPress={() => void dispatch(completeDuty(duty.id))}
                  accessibilityHint="Menandai piket ini sudah dikerjakan"
                />
              </View>
            ) : null}
            <View style={styles.badgeWrap}>
              <StatusBadge status={duty.status} label={duty.completedAt ? 'Selesai' : (duty.status ?? 'Terjadwal')} />
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  notes: { fontSize: 13, marginTop: 4 },
  action: { marginTop: 8 },
  badgeWrap: { marginTop: 8 },
});
