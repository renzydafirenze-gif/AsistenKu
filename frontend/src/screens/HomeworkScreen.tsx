import React, { useCallback, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { StatusBadge } from '../components/StatusBadge';
import { useAppDispatch, useAppSelector } from '../store';
import { completeHomework, loadDashboard, loadHomework } from '../store/dataSlice';
import { useTheme } from '../theme/ThemeProvider';
import { brand } from '../theme/tokens';
import { formatDateKey, formatIndonesianDate, relativeDayLabel } from '../utils/format';

const LATE = '#C0392B';

export function HomeworkScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((state) => state.data.homework);
  const today = formatDateKey(new Date());

  const refresh = useCallback(() => {
    void dispatch(loadHomework());
  }, [dispatch]);

  useEffect(() => {
    if (status === 'idle') refresh();
  }, [refresh, status]);

  const markDone = useCallback(
    async (id: string) => {
      await dispatch(completeHomework(id));
      // The dashboard card counts pending tasks, so keep it in step.
      void dispatch(loadDashboard());
    },
    [dispatch],
  );

  return (
    <Screen
      title="Pekerjaan rumah"
      subtitle="PR terlambat berwarna merah dan tidak bisa dihapus."
      refreshing={status === 'loading'}
      onRefresh={refresh}
    >
      {error ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          {error}
        </Text>
      ) : null}

      {status !== 'loading' && data.length === 0 ? (
        <EmptyState title="Tidak ada PR" hint="Belum ada tugas di data contoh." />
      ) : null}

      {data.map((homework) => {
        const overdue = homework.isLate || homework.isOverdue;
        const submitted = homework.assignment?.status === 'SUBMITTED';
        const accent = overdue ? LATE : (homework.accentColor ?? brand.primary);
        const dueKey = homework.dueDate.slice(0, 10);
        return (
          <Card
            key={homework.id}
            testID={`homework-${homework.id}`}
            title={homework.title}
            subtitle={`${homework.subject?.name ?? 'Tanpa mapel'} · tenggat ${formatIndonesianDate(dueKey)}`}
            tone={accent}
            badge={{
              label: overdue ? 'Terlambat' : relativeDayLabel(today, dueKey),
              color: accent,
            }}
          >
            {homework.description ? (
              <Text style={[styles.description, { color: theme.colors.textMuted }]}>
                {homework.description}
              </Text>
            ) : null}
            <View style={styles.row}>
              <StatusBadge
                status={overdue ? 'OVERDUE' : submitted ? 'SUBMITTED' : 'UPCOMING'}
                label={
                  overdue
                    ? submitted
                      ? 'Dikumpulkan terlambat'
                      : 'Terlambat'
                    : submitted
                      ? 'Selesai'
                      : 'Belum selesai'
                }
              />
            </View>
            {!submitted ? (
              <View style={styles.action}>
                <PrimaryButton
                  label="Tandai selesai"
                  onPress={() => void markDone(homework.id)}
                  accessibilityHint={`Menandai PR ${homework.title} sudah dikumpulkan`}
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
  description: { fontSize: 14, marginTop: 4 },
  row: { marginTop: 8 },
  action: { marginTop: 8 },
});
