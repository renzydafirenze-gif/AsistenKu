import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { EmptyState } from '../components/EmptyState';
import { ListRow } from '../components/ListRow';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';
import { Sheet } from '../components/Sheet';
import { StatTile } from '../components/StatTile';
import { TextField } from '../components/TextField';
import type { MainTabParams, RootStackParams } from '../navigation/RootNavigator';
import { useAppDispatch, useAppSelector } from '../store';
import { clearAll, loadDemo, refreshAll, updateProfile } from '../store/dataSlice';
import { useTheme } from '../theme/ThemeProvider';
import { statusTone } from '../theme/tokens';
import { errorHaptic, successHaptic } from '../utils/haptic';
import { formatDateKey, formatIndonesianDate, greetingForHour } from '../utils/format';

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Perubahan tidak tersimpan.';
};

export function DashboardScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation =
    useNavigation<
      CompositeNavigationProp<
        BottomTabNavigationProp<MainTabParams>,
        NativeStackNavigationProp<RootStackParams>
      >
    >();
  const { data, status, error } = useAppSelector((state) => state.data.dashboard);
  const today = formatDateKey(new Date());

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    void dispatch(refreshAll());
  }, [dispatch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openSettings = () => {
    setNameDraft(data?.user.fullName ?? '');
    setSettingsOpen(true);
  };

  const saveName = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await dispatch(updateProfile(nameDraft)).unwrap();
      successHaptic();
      setSettingsOpen(false);
    } catch (failure) {
      errorHaptic();
      Alert.alert('Gagal menyimpan', errorMessage(failure));
    } finally {
      setSaving(false);
    }
  };

  const runSettingsAction = (action: Promise<unknown>, label: string) => {
    action
      .then(() => {
        successHaptic();
        setSettingsOpen(false);
      })
      .catch((failure) => {
        errorHaptic();
        Alert.alert(label, errorMessage(failure));
      });
  };

  const confirmClear = () => {
    Alert.alert('Kosongkan semua data?', 'Jadwal, PR, ujian, dan mapel akan dihapus. Namamu tetap tersimpan.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Kosongkan',
        style: 'destructive',
        onPress: () => runSettingsAction(dispatch(clearAll()).unwrap(), 'Gagal mengosongkan'),
      },
    ]);
  };

  const confirmDemo = () => {
    Alert.alert('Muat data contoh?', 'Data saat ini akan diganti dengan data contoh.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Muat',
        onPress: () => runSettingsAction(dispatch(loadDemo()).unwrap(), 'Gagal memuat data contoh'),
      },
    ]);
  };

  const detail = data?.detail;
  const dutyTone = statusTone(theme, detail?.duty?.completedAt ? 'COMPLETED' : detail?.duty?.status);
  const pending = detail?.homework?.pending ?? [];
  const dueToday = pending.filter((item) => item.dueDate.slice(0, 10) <= today);
  const nextExam = detail?.exam;
  const agenda = [
    detail?.duty
      ? {
          key: 'duty',
          title: 'Piket',
          meta: detail.duty.assignedStudentName
            ? `Bertugas · ${detail.duty.assignedStudentName}`
            : 'Piket hari ini',
          detail: detail.duty.notes ?? undefined,
          tone: dutyTone.background,
          onPress: () => navigation.navigate('Duty'),
        }
      : null,
    ...dueToday.slice(0, 3).map((item) => ({
      key: `hw-${item.id}`,
      title: item.title,
      // Late work is called out here too, not only on the PR tab.
      meta: `${item.subject?.name ?? 'Tanpa mapel'} · ${
        item.isLate ? 'terlambat' : 'tenggat'
      } ${formatIndonesianDate(item.dueDate.slice(0, 10))}`,
      detail: undefined,
      tone: item.isLate ? theme.colors.danger : theme.colors.primary,
      onPress: () => navigation.navigate('Homework'),
    })),
    nextExam && nextExam.examDate === today
      ? {
          key: `exam-${nextExam.id}`,
          title: nextExam.title,
          meta: `${nextExam.startTime}–${nextExam.endTime}${nextExam.room ? ` · ${nextExam.room}` : ''}`,
          detail: undefined,
          tone: theme.colors.secondary,
          onPress: () => navigation.navigate('Exam'),
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    title: string;
    meta: string;
    detail?: string;
    tone: string;
    onPress: () => void;
  }>;

  return (
    <Screen
      eyebrow="AsistenKu"
      title={data?.greeting ?? greetingForHour(new Date().getHours())}
      subtitle={
        data ? `${data.user.fullName} · ${formatIndonesianDate(today)}` : 'Menyiapkan data…'
      }
      refreshing={status === 'loading'}
      onRefresh={refresh}
      headerAccessory={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pengaturan"
          onPress={openSettings}
          style={({ pressed }) => [styles.gear, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="settings-outline" size={22} color={theme.colors.textMuted} />
        </Pressable>
      }
    >
      {error ? <EmptyState title="Gagal memuat data" hint={error} icon="alert-circle-outline" /> : null}

      <View style={styles.stats}>
        <StatTile
          testID="stat-duty"
          label="Piket"
          value={!detail?.duty ? '—' : detail.duty.completedAt ? 'Selesai' : 'Hari ini'}
          hint={detail?.duty ? detail.duty.assignedStudentName : 'belum ada'}
          tone={dutyTone.background}
          onPress={() => navigation.navigate('Duty')}
        />
        <StatTile
          testID="stat-homework"
          label="PR"
          value={`${pending.length}`}
          hint={detail?.homework?.lateCount ? `${detail.homework.lateCount} terlambat` : 'belum selesai'}
          tone={
            detail?.homework?.lateCount ? theme.colors.danger : theme.colors.accent
          }
          onPress={() => navigation.navigate('Homework')}
        />
        <StatTile
          testID="stat-exam"
          label="Ujian"
          value={
            nextExam
              ? (nextExam.daysUntil ?? 0) <= 0
                ? 'Hari ini'
                : `H-${nextExam.daysUntil}`
              : '—'
          }
          hint={nextExam?.subject?.name ?? 'belum ada'}
          tone={theme.colors.secondary}
          onPress={() => navigation.navigate('Exam')}
        />
      </View>

      <SectionHeader title="Hari ini" aside={`${agenda.length} item`} />
      {agenda.length === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title="Tidak ada agenda hari ini"
          hint="Tambahkan piket, PR atau ujian dari tab di bawah."
        />
      ) : (
        agenda.map((item) => (
          <ListRow
            key={item.key}
            title={item.title}
            meta={item.meta}
            detail={item.detail}
            tone={item.tone}
            onPress={item.onPress}
            accessibilityHint="Membuka halaman terkait"
          />
        ))
      )}

      <SectionHeader title="Seragam" />
      <ListRow
        testID="dashboard-link-uniform"
        title={detail?.uniform ? detail.uniform.label : 'Belum diatur'}
        meta={detail?.uniform ? 'Seragam hari ini' : 'Atur pengingat seragam'}
        detail={detail?.uniform?.detail ?? undefined}
        onPress={() => navigation.navigate('Uniform')}
        accessibilityHint="Membuka pengingat seragam"
      />

      <SectionHeader title="Kelola" />
      <ListRow
        testID="dashboard-link-subjects"
        title="Mata pelajaran"
        meta={`${detail?.subjects?.length ?? 0} mapel terdaftar`}
        onPress={() => navigation.navigate('Subjects')}
        accessibilityHint="Membuka daftar mata pelajaran"
      />
      <ListRow
        testID="dashboard-link-settings"
        title="Pengaturan"
        meta="Nama siswa, data contoh, hapus semua data"
        onPress={openSettings}
        accessibilityHint="Membuka pengaturan"
      />

      <Text style={[theme.typography.caption, styles.footer, { color: theme.colors.textMuted }]}>
        AsistenKu (AKU) · semua data tersimpan di HP ini, tanpa internet
      </Text>

      <Sheet
        visible={settingsOpen}
        title="Pengaturan"
        onClose={() => setSettingsOpen(false)}
        footer={<PrimaryButton label="Simpan nama" loading={saving} onPress={() => void saveName()} />}
      >
        <TextField
          label="Nama siswa"
          value={nameDraft}
          onChangeText={setNameDraft}
          placeholder="Nama kamu"
          testID="profile-name"
        />
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
          Data contoh hanya untuk mencoba aplikasi. Semua data tersimpan di perangkat ini dan tidak
          dikirim ke mana pun.
        </Text>
        <PrimaryButton label="Muat data contoh" tone="ghost" onPress={confirmDemo} />
        <PrimaryButton label="Kosongkan semua data" tone="danger" onPress={confirmClear} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 8, marginTop: 4 },
  gear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  footer: { textAlign: 'center', marginTop: 16 },
});
