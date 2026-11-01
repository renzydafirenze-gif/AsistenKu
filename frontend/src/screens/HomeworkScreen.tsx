import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Card } from '../components/Card';
import { CardActions } from '../components/CardActions';
import { EmptyState } from '../components/EmptyState';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { StatusBadge } from '../components/StatusBadge';
import { TextField } from '../components/TextField';
import type { Homework } from '../api/types';
import { todayKey } from '../offline/repository';
import { useAppDispatch, useAppSelector } from '../store';
import { completeHomework, refreshAll, removeHomework, saveHomework } from '../store/dataSlice';
import { useTheme } from '../theme/ThemeProvider';
import { brand } from '../theme/tokens';
import { formatDateKey, formatIndonesianDate, relativeDayLabel } from '../utils/format';

const LATE = '#C0392B';

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Perubahan tidak tersimpan.';
};

export function HomeworkScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((state) => state.data.homework);
  const today = formatDateKey(new Date());

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [dueDate, setDueDate] = useState(todayKey());
  const [description, setDescription] = useState('');

  const refresh = useCallback(() => {
    void dispatch(refreshAll());
  }, [dispatch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openCreate = () => {
    setEditingId(null);
    setTitle('');
    setSubjectName('');
    setDueDate(todayKey());
    setDescription('');
    setFormOpen(true);
  };

  const openEdit = (homework: Homework) => {
    setEditingId(homework.id);
    setTitle(homework.title);
    setSubjectName(homework.subject?.name ?? '');
    setDueDate(homework.dueDate.slice(0, 10));
    setDescription(homework.description ?? '');
    setFormOpen(true);
  };

  const submit = async () => {
    try {
      await dispatch(
        saveHomework({
          input: { title, subjectName, dueDate, description },
          id: editingId ?? undefined,
        }),
      ).unwrap();
      setFormOpen(false);
    } catch (failure) {
      Alert.alert('Gagal menyimpan', errorMessage(failure));
    }
  };

  const confirmDelete = (homework: Homework) => {
    Alert.alert('Hapus PR?', homework.title, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          dispatch(removeHomework(homework.id)).unwrap().catch((failure) => {
            Alert.alert('Gagal menghapus', errorMessage(failure));
          });
        },
      },
    ]);
  };

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

      {formOpen ? (
        <View style={[styles.form, { borderColor: theme.colors.border }]}>
          <Text style={[styles.formTitle, { color: theme.colors.text }]}>
            {editingId ? 'Ubah PR' : 'PR baru'}
          </Text>
          <TextField
            label="Judul"
            value={title}
            onChangeText={setTitle}
            placeholder="Contoh: Latihan pecahan halaman 42"
            testID="homework-title"
          />
          <TextField
            label="Mata pelajaran"
            value={subjectName}
            onChangeText={setSubjectName}
            placeholder="Contoh: Matematika"
            testID="homework-subject"
          />
          <TextField
            label="Tenggat (YYYY-MM-DD)"
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="2026-11-05"
            autoCapitalize="none"
            testID="homework-due"
          />
          <TextField
            label="Catatan (opsional)"
            value={description}
            onChangeText={setDescription}
            placeholder="Detail tugas"
            testID="homework-description"
          />
          <PrimaryButton label="Simpan PR" onPress={() => void submit()} />
          <PrimaryButton label="Batal" tone="ghost" onPress={() => setFormOpen(false)} />
        </View>
      ) : (
        <PrimaryButton label="Tambah PR" onPress={openCreate} />
      )}

      {status !== 'loading' && data.length === 0 && !formOpen ? (
        <EmptyState title="Belum ada PR" hint="Tekan “Tambah PR” untuk mencatat tugas pertama." />
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
            badge={{ label: overdue ? 'Terlambat' : relativeDayLabel(today, dueKey), color: accent }}
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
                  onPress={() => {
                    dispatch(completeHomework(homework.id)).unwrap().catch((failure) => {
                      Alert.alert('Gagal menyimpan', errorMessage(failure));
                    });
                  }}
                  accessibilityHint={`Menandai PR ${homework.title} sudah dikumpulkan`}
                />
              </View>
            ) : null}
            <CardActions
              onEdit={() => openEdit(homework)}
              onDelete={() => confirmDelete(homework)}
              deleteDisabled={overdue}
              deleteHint={
                overdue ? 'PR terlambat tidak bisa dihapus' : `Hapus PR ${homework.title}`
              }
            />
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
  form: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 10 },
  formTitle: { fontSize: 16, fontWeight: '700' },
});
