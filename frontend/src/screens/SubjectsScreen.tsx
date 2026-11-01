import React, { useCallback, useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { useAppDispatch, useAppSelector } from '../store';
import { loadSubjects } from '../store/dataSlice';
import { useTheme } from '../theme/ThemeProvider';

export function SubjectsScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((state) => state.data.subjects);

  const refresh = useCallback(() => {
    void dispatch(loadSubjects());
  }, [dispatch]);

  useEffect(() => {
    if (status === 'idle') refresh();
  }, [refresh, status]);

  return (
    <Screen
      title="Mata pelajaran"
      subtitle={`${data.length} mapel · guru pengampu`}
      refreshing={status === 'loading'}
      onRefresh={refresh}
    >
      {error ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          {error}
        </Text>
      ) : null}

      {status !== 'loading' && data.length === 0 ? (
        <EmptyState title="Belum ada mata pelajaran" hint="Data contoh belum memuat mapel." />
      ) : null}

      {data.map((subject) => (
        <Card
          key={subject.id}
          testID={`subject-${subject.id}`}
          title={subject.name}
          subtitle={subject.teacher ? subject.teacher.fullName : 'Guru belum ditetapkan'}
          badge={{ label: subject.code, color: theme.colors.primary }}
        >
          {subject.teacher?.email ? (
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
              {subject.teacher.email}
            </Text>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 13 },
});
