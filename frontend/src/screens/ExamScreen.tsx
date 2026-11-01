import React, { useCallback, useEffect } from 'react';
import { Text, View, StyleSheet } from 'react-native';

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { StatusBadge } from '../components/StatusBadge';
import { useAppDispatch, useAppSelector } from '../store';
import { loadExams } from '../store/dataSlice';
import { useTheme } from '../theme/ThemeProvider';
import { formatDateKey, formatIndonesianDay, relativeDayLabel } from '../utils/format';

export function ExamScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((state) => state.data.exams);
  const today = formatDateKey(new Date());

  const refresh = useCallback(() => {
    void dispatch(loadExams());
  }, [dispatch]);

  useEffect(() => {
    if (status === 'idle') refresh();
  }, [refresh, status]);

  return (
    <Screen
      title="Jadwal ujian"
      subtitle="Jadwal yang sudah dipublikasikan tidak dapat diubah."
      refreshing={status === 'loading'}
      onRefresh={refresh}
    >
      {error ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          {error}
        </Text>
      ) : null}

      {status !== 'loading' && data.length === 0 ? (
        <EmptyState title="Belum ada ujian" hint="Guru akan mempublikasikan jadwal di sini." />
      ) : null}

      {data.map((exam) => {
        const until = exam.daysUntil ?? 0;
        const statusKey = until < 0 ? 'OVERDUE' : until === 0 ? 'TODAY' : 'UPCOMING';
        return (
          <Card
            key={exam.id}
            testID={`exam-${exam.id}`}
            title={exam.title}
            subtitle={`${exam.subject?.name ?? 'Mata pelajaran'} · ${exam.startTime}–${exam.endTime}${
              exam.room ? ` · ${exam.room}` : ''
            }`}
            badge={{ label: relativeDayLabel(today, exam.examDate), color: theme.colors.secondary }}
          >
            <Text style={[styles.date, { color: theme.colors.textMuted }]}>
              {formatIndonesianDay(exam.examDate)}
            </Text>
            <View style={styles.row}>
              <StatusBadge status={statusKey} label={exam.isLocked ? 'Terpublikasi' : 'Draf'} />
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  date: { fontSize: 14, marginTop: 4 },
  row: { marginTop: 8 },
});
