import React, { useCallback, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { StatusBadge } from '../components/StatusBadge';
import { useAppDispatch, useAppSelector } from '../store';
import { loadHomework } from '../store/dataSlice';
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
        <EmptyState title="Tidak ada PR" hint="Tugas baru akan muncul di sini." />
      ) : null}

      {data.map((homework) => {
        const overdue = homework.isLate || homework.isOverdue;
        const accent = overdue ? LATE : (homework.accentColor ?? brand.primary);
        const dueKey = homework.dueDate.slice(0, 10);
        return (
          <Card
            key={homework.id}
            testID={`homework-${homework.id}`}
            title={homework.title}
            subtitle={`${homework.subject?.name ?? 'Tanpa mapel'} · tenggat ${formatIndonesianDate(dueKey)}`}
            tone={accent}
            badge={{ label: overdue ? 'Terlambat' : relativeDayLabel(today, dueKey), color: accent }}
          >
            {homework.description ? (
              <Text style={[styles.description, { color: theme.colors.textMuted }]}>
                {homework.description}
              </Text>
            ) : null}
            <View style={styles.row}>
              <StatusBadge
                status={overdue ? 'OVERDUE' : 'UPCOMING'}
                label={overdue ? 'Terlambat' : 'Belum selesai'}
              />
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  description: { fontSize: 14, marginTop: 4 },
  row: { marginTop: 8 },
});
