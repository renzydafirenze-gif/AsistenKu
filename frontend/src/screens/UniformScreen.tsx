import React, { useCallback, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChecklistRow } from '../components/ChecklistRow';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { StatusBadge } from '../components/StatusBadge';
import { useAppDispatch, useAppSelector } from '../store';
import { refreshAll, toggleUniform } from '../store/dataSlice';
import { useTheme } from '../theme/ThemeProvider';
import { formatDateKey, formatIndonesianDay } from '../utils/format';

export function UniformScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((state) => state.data.uniform);
  const today = formatDateKey(new Date());

  const refresh = useCallback(() => {
    void dispatch(refreshAll());
  }, [dispatch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isHoliday = data?.status === 'HOLIDAY';
  const progress = data ? `${data.completedCount}/${data.total}` : '–';

  return (
    <Screen
      title="Seragam hari ini"
      subtitle={formatIndonesianDay(today)}
      refreshing={status === 'loading'}
      onRefresh={refresh}
    >
      {error ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          {error}
        </Text>
      ) : null}

      {status === 'loading' && !data ? <EmptyState title="Memuat checklist…" /> : null}

      {data ? (
        <View style={styles.summary}>
          <Text
            accessibilityLabel={`${data.completedCount} dari ${data.total} item selesai`}
            style={[styles.progress, { color: theme.colors.text }]}
          >
            {progress} item selesai
          </Text>
          {data.badge ? <StatusBadge status={data.status} label={data.badge.label} /> : null}
        </View>
      ) : null}

      {data?.note ? (
        <Text style={[styles.note, { color: theme.colors.textMuted }]}>{data.note}</Text>
      ) : null}

      {isHoliday ? (
        <EmptyState title="Hari libur" hint="Tidak ada seragam wajib hari ini. Selamat beristirahat!" />
      ) : null}

      {data && !isHoliday
        ? data.items.map((item) => (
            <ChecklistRow
              key={item.key}
              label={item.label}
              category={item.category}
              checked={item.checked}
              disabled={status === 'loading'}
              onToggle={(checked) => {
                void dispatch(toggleUniform({ date: data.date, itemKey: item.key, checked }));
              }}
            />
          ))
        : null}

      {data && !isHoliday && data.items.length === 0 ? (
        <EmptyState title="Belum ada item seragam" hint="Kalender akademik belum diisi untuk hari ini." />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  progress: { fontSize: 16, fontWeight: '600' },
  note: { fontSize: 14 },
});
