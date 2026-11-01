import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '../components/Card';
import { CardActions } from '../components/CardActions';
import { EmptyState } from '../components/EmptyState';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import type { Duty, DutyShift } from '../api/types';
import { todayKey } from '../offline/repository';
import { useAppDispatch, useAppSelector } from '../store';
import { completeDuty, refreshAll, removeDuty, saveDuty } from '../store/dataSlice';
import { useTheme } from '../theme/ThemeProvider';
import { statusTone } from '../theme/tokens';
import { formatIndonesianDay, shiftLabel } from '../utils/format';

const DUTY_LABEL: Record<string, string> = {
  COMPLETED: 'Selesai',
  TODAY: 'Hari ini',
  UPCOMING: 'Terjadwal',
  OVERDUE: 'Terlewat',
};

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Perubahan tidak tersimpan.';
};

export function DutyScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((state) => state.data.duties);
  const userName = useAppSelector((state) => state.data.dashboard.data?.user.fullName ?? 'Siswa');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(todayKey());
  const [shift, setShift] = useState<DutyShift>('MORNING');
  const [studentName, setStudentName] = useState(userName);
  const [notes, setNotes] = useState('');

  const refresh = useCallback(() => {
    void dispatch(refreshAll());
  }, [dispatch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openCreate = () => {
    setEditingId(null);
    setDate(todayKey());
    setShift('MORNING');
    setStudentName(userName);
    setNotes('');
    setFormOpen(true);
  };

  const openEdit = (duty: Duty) => {
    setEditingId(duty.id);
    setDate(duty.date);
    setShift(duty.shift);
    setStudentName(duty.assignedStudentName ?? userName);
    setNotes(duty.notes ?? '');
    setFormOpen(true);
  };

  const submit = async () => {
    try {
      await dispatch(
        saveDuty({ input: { date, shift, studentName, notes }, id: editingId ?? undefined }),
      ).unwrap();
      setFormOpen(false);
    } catch (failure) {
      Alert.alert('Gagal menyimpan', errorMessage(failure));
    }
  };

  const confirmDelete = (duty: Duty) => {
    Alert.alert('Hapus jadwal piket?', formatIndonesianDay(duty.date), [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          dispatch(removeDuty(duty.id)).unwrap().catch((failure) => {
            Alert.alert('Gagal menghapus', errorMessage(failure));
          });
        },
      },
    ]);
  };

  return (
    <Screen
      title="Jadwal piket"
      subtitle="Atur sendiri siapa yang bertugas dan kapan."
      refreshing={status === 'loading'}
      onRefresh={refresh}
    >
      {error ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          {error}
        </Text>
      ) : null}

      {formOpen ? (
        <View style={[styles.form, { borderColor: theme.colors.border }]}>
          <Text style={[styles.formTitle, { color: theme.colors.text }]}>
            {editingId ? 'Ubah piket' : 'Piket baru'}
          </Text>
          <TextField
            label="Tanggal (YYYY-MM-DD)"
            value={date}
            onChangeText={setDate}
            placeholder="2026-11-01"
            autoCapitalize="none"
            testID="duty-date"
          />
          <View style={styles.shiftRow}>
            {(['MORNING', 'AFTERNOON'] as DutyShift[]).map((value) => (
              <View key={value} style={styles.shiftCell}>
                <PrimaryButton
                  label={shiftLabel(value)}
                  tone={shift === value ? 'primary' : 'ghost'}
                  onPress={() => setShift(value)}
                />
              </View>
            ))}
          </View>
          <TextField
            label="Nama siswa"
            value={studentName}
            onChangeText={setStudentName}
            placeholder="Nama yang bertugas"
            testID="duty-student"
          />
          <TextField
            label="Catatan (opsional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Contoh: sapu dan pel lantai"
            testID="duty-notes"
          />
          <PrimaryButton label="Simpan piket" onPress={() => void submit()} />
          <PrimaryButton label="Batal" tone="ghost" onPress={() => setFormOpen(false)} />
        </View>
      ) : (
        <PrimaryButton label="Tambah piket" onPress={openCreate} />
      )}

      {status !== 'loading' && data.length === 0 && !formOpen ? (
        <EmptyState title="Belum ada jadwal piket" hint="Tekan “Tambah piket” untuk membuat jadwal pertama." />
      ) : null}

      {data.map((duty) => {
        const tone = statusTone(theme, duty.completedAt ? 'COMPLETED' : duty.status);
        return (
          <Card
            key={duty.id}
            testID={`duty-${duty.id}`}
            title={formatIndonesianDay(duty.date)}
            subtitle={`Shift ${shiftLabel(duty.shift)}${duty.assignedStudentName ? ` · ${duty.assignedStudentName}` : ''}`}
            tone={tone.background}
            badge={{
              label: DUTY_LABEL[duty.completedAt ? 'COMPLETED' : (duty.status ?? '')] ?? 'Terjadwal',
              color: tone.background,
            }}
          >
            {duty.notes ? (
              <Text style={[styles.notes, { color: theme.colors.textMuted }]}>{duty.notes}</Text>
            ) : null}
            {duty.canComplete ? (
              <View style={styles.action}>
                <PrimaryButton
                  label="Tandai selesai"
                  onPress={() => {
                    dispatch(completeDuty(duty.id)).unwrap().catch((failure) => {
                      Alert.alert('Gagal menyimpan', errorMessage(failure));
                    });
                  }}
                  accessibilityHint="Menandai piket ini sudah dikerjakan"
                />
              </View>
            ) : null}
            <CardActions onEdit={() => openEdit(duty)} onDelete={() => confirmDelete(duty)} />
          </Card>
        );
      })}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Muat ulang jadwal piket"
        onPress={refresh}
        style={styles.refreshLink}
      >
        <Text style={{ color: theme.colors.primaryText }}>Muat ulang</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  notes: { fontSize: 13, marginTop: 4 },
  action: { marginTop: 8 },
  form: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 10 },
  formTitle: { fontSize: 16, fontWeight: '700' },
  shiftRow: { flexDirection: 'row', gap: 8 },
  shiftCell: { flex: 1 },
  refreshLink: { alignItems: 'center', paddingVertical: 8 },
});
