import React, { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChecklistRow } from '../components/ChecklistRow';
import type { UniformItem } from '../api/types';
import { EmptyState } from '../components/EmptyState';
import { ProgressBar } from '../components/ProgressBar';
import { Screen } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';
import { useAppDispatch, useAppSelector } from '../store';
import { refreshAll, toggleUniform } from '../store/dataSlice';
import { formatDateKey, formatIndonesianDay } from '../utils/format';

export function UniformScreen() {
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

  // One section per uniform category (Atasan, Bawahan, Atribut, Alas kaki).
  const groups = (data?.items ?? []).reduce<Array<{ title: string; items: UniformItem[] }>>(
    (all, item) => {
      const title = item.category ?? 'Lainnya';
      const bucket = all.find((group) => group.title === title);
      if (bucket) bucket.items.push(item);
      else all.push({ title, items: [item] });
      return all;
    },
    [],
  );

  return (
    <Screen
      eyebrow="AsistenKu"
      title="Seragam"
      subtitle={formatIndonesianDay(today)}
      refreshing={status === 'loading'}
      onRefresh={refresh}
      headerAccessory={
        data ? (
          <View style={styles.progress}>
            <ProgressBar
              value={data.completedCount}
              total={data.total}
              label={`${data.completedCount}/${data.total} selesai`}
            />
          </View>
        ) : null
      }
    >
      {error ? <EmptyState title="Gagal memuat data" hint={error} icon="alert-circle-outline" /> : null}

      {isHoliday ? (
        <EmptyState
          icon="sunny-outline"
          title="Hari libur"
          hint={data?.note ?? 'Tidak ada seragam wajib hari ini. Selamat beristirahat!'}
        />
      ) : null}

      {data && !isHoliday && data.items.length === 0 ? (
        <EmptyState
          icon="shirt-outline"
          title="Belum ada item seragam"
          hint="Checklist seragam akan muncul di sini."
        />
      ) : null}

      {!isHoliday
        ? groups.map((group) => (
            <React.Fragment key={group.title}>
              <SectionHeader title={group.title} />
              {group.items.map((item) => (
                <ChecklistRow
                  key={item.key}
                  label={item.label}
                  category={item.category}
                  checked={item.checked}
                  disabled={status === 'loading'}
                  onToggle={(checked) => {
                    void dispatch(toggleUniform({ date: data!.date, itemKey: item.key, checked }));
                  }}
                />
              ))}
            </React.Fragment>
          ))
        : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { width: 120 },
});
