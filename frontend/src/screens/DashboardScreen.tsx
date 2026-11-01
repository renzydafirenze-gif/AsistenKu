import React, { useCallback, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { StatusBadge } from '../components/StatusBadge';
import type { DashboardCard } from '../api/types';
import type { MainTabParams } from '../navigation/RootNavigator';
import { useAppDispatch, useAppSelector } from '../store';
import { loadDashboard } from '../store/dataSlice';
import { useTheme } from '../theme/ThemeProvider';
import { formatIndonesianDay, formatDateKey, greetingForHour, relativeDayLabel } from '../utils/format';

const ROUTE_BY_CARD: Record<DashboardCard['key'], keyof MainTabParams> = {
  duty: 'Duty',
  uniform: 'Uniform',
  homework: 'Homework',
  exam: 'Exam',
  subjects: 'Dashboard',
};

export function DashboardScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParams>>();
  const { data, status, error } = useAppSelector((state) => state.data.dashboard);
  const today = formatDateKey(new Date());

  const refresh = useCallback(() => {
    void dispatch(loadDashboard());
  }, [dispatch]);

  useEffect(() => {
    if (status === 'idle') refresh();
  }, [refresh, status]);

  const greeting = data?.greeting ?? greetingForHour(new Date().getHours());
  const lateCount = data?.detail?.homework?.lateCount ?? 0;

  return (
    <Screen
      title={greeting}
      subtitle={data ? `${data.user.fullName} · ${formatIndonesianDay(today)}` : formatIndonesianDay(today)}
      refreshing={status === 'loading'}
      onRefresh={refresh}
    >
      {error ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          {error}
        </Text>
      ) : null}

      {status === 'loading' && !data ? <EmptyState title="Memuat dasbor…" /> : null}
      {status !== 'loading' && !data ? (
        <EmptyState title="Dasbor belum tersedia" hint="Tarik ke bawah untuk mencoba lagi." />
      ) : null}

      {data?.cards.map((card) => (
        <Card
          key={card.key}
          testID={`dashboard-card-${card.key}`}
          title={card.title}
          subtitle={card.summary}
          badge={card.badge}
          onPress={() => navigation.navigate(ROUTE_BY_CARD[card.key])}
          accessibilityHint="Membuka halaman terkait"
        >
          {card.key === 'homework' && lateCount > 0 ? (
            <View style={styles.inlineBadge}>
              <StatusBadge status="#C0392B" label={`${lateCount} terlambat`} />
            </View>
          ) : null}
        </Card>
      ))}

      {data?.detail?.exam ? (
        <Card
          title={`Ujian berikutnya: ${data.detail.exam.title}`}
          subtitle={`${formatIndonesianDay(data.detail.exam.examDate)} · ${data.detail.exam.startTime}–${data.detail.exam.endTime}`}
          badge={
            data.detail.exam.daysUntil === undefined
              ? undefined
              : { label: relativeDayLabel(today, data.detail.exam.examDate), color: theme.colors.secondary }
          }
          onPress={() => navigation.navigate('Exam')}
        />
      ) : null}

      {data?.detail?.uniform ? (
        <Card
          title="Checklist seragam"
          subtitle={`${data.detail.uniform.completedCount} dari ${data.detail.uniform.total} item selesai`}
          badge={data.detail.uniform.badge}
          onPress={() => navigation.navigate('Uniform')}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  inlineBadge: { marginTop: 6 },
});
