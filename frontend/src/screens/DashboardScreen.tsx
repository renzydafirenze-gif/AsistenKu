import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { StatusBadge } from '../components/StatusBadge';
import { TextField } from '../components/TextField';
import type { DashboardCard } from '../api/types';
import type { MainTabParams } from '../navigation/RootNavigator';
import { useAppDispatch, useAppSelector } from '../store';
import { clearAll, loadDemo, refreshAll, updateProfile } from '../store/dataSlice';
import { useTheme } from '../theme/ThemeProvider';
import { formatDateKey, formatIndonesianDay, greetingForHour, relativeDayLabel } from '../utils/format';

const ROUTE_BY_CARD: Record<DashboardCard['key'], keyof MainTabParams> = {
  duty: 'Duty',
  uniform: 'Uniform',
  homework: 'Homework',
  exam: 'Exam',
  subjects: 'Subjects',
};

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
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParams>>();
  const { data, status, error } = useAppSelector((state) => state.data.dashboard);
  const today = formatDateKey(new Date());

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

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
    try {
      await dispatch(updateProfile(nameDraft)).unwrap();
      setSettingsOpen(false);
    } catch (failure) {
      Alert.alert('Gagal menyimpan', errorMessage(failure));
    }
  };

  const runSettingsAction = (action: Promise<unknown>, label: string) => {
    action
      .then(() => setSettingsOpen(false))
      .catch((failure) => Alert.alert(label, errorMessage(failure)));
  };

  const confirmClear = () => {
    Alert.alert('Kosongkan semua data?', 'Jadwal, PR, ujian, dan mapel akan dihapus.', [
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

  const greeting = data?.greeting ?? greetingForHour(new Date().getHours());
  const lateCount = data?.detail?.homework?.lateCount ?? 0;

  return (
    <Screen
      title={greeting}
      subtitle={data ? `${data.user.fullName} · ${formatIndonesianDay(today)}` : formatIndonesianDay(today)}
      refreshing={status === 'loading'}
      onRefresh={refresh}
      headerAccessory={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pengaturan"
          onPress={openSettings}
          style={({ pressed }) => [
            styles.gear,
            {
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={{ color: theme.colors.text, fontSize: 20 }}>⚙</Text>
        </Pressable>
      }
    >
      {error ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          {error}
        </Text>
      ) : null}

      {status === 'loading' && !data ? <EmptyState title="Memuat dasbor…" /> : null}

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

      <View style={styles.footer}>
        <Text style={[styles.brand, { color: theme.colors.textMuted }]}>
          AsistenKu (AKU) · data tersimpan di perangkat
        </Text>
      </View>

      <Modal
        visible={settingsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text accessibilityRole="header" style={[styles.modalTitle, { color: theme.colors.text }]}>
                Pengaturan
              </Text>
              <TextField
                label="Nama siswa"
                value={nameDraft}
                onChangeText={setNameDraft}
                placeholder="Nama kamu"
                testID="profile-name"
              />
              <PrimaryButton label="Simpan nama" onPress={() => void saveName()} />
              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
              <Text style={[styles.modalHint, { color: theme.colors.textMuted }]}>
                Data contoh hanya untuk mencoba aplikasi. Semua data tersimpan di HP ini dan
                tidak dikirim ke mana pun.
              </Text>
              <PrimaryButton label="Muat data contoh" tone="ghost" onPress={confirmDemo} />
              <PrimaryButton label="Kosongkan semua data" tone="danger" onPress={confirmClear} />
              <PrimaryButton label="Tutup" tone="ghost" onPress={() => setSettingsOpen(false)} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inlineBadge: { marginTop: 6 },
  footer: { marginTop: 12 },
  brand: { fontSize: 12, textAlign: 'center' },
  gear: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '85%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalContent: { padding: 20, gap: 12 },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  modalHint: { fontSize: 13, lineHeight: 19 },
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
});
