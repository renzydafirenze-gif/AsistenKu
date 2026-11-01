import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Card } from '../components/Card';
import { CardActions } from '../components/CardActions';
import { EmptyState } from '../components/EmptyState';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { StatusBadge } from '../components/StatusBadge';
import { TextField } from '../components/TextField';
import type { Exam } from '../api/types';
import { todayKey } from '../offline/repository';
import { useAppDispatch, useAppSelector } from '../store';
import { publishExam, refreshAll, removeExam, saveExam } from '../store/dataSlice';
import { useTheme } from '../theme/ThemeProvider';
import { formatDateKey, formatIndonesianDay, relativeDayLabel } from '../utils/format';

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Perubahan tidak tersimpan.';
};

export function ExamScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((state) => state.data.exams);
  const today = formatDateKey(new Date());

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [examDate, setExamDate] = useState(todayKey());
  const [startTime, setStartTime] = useState('07:30');
  const [endTime, setEndTime] = useState('09:00');
  const [room, setRoom] = useState('');

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
    setExamDate(todayKey());
    setStartTime('07:30');
    setEndTime('09:00');
    setRoom('');
    setFormOpen(true);
  };

  const openEdit = (exam: Exam) => {
    setEditingId(exam.id);
    setTitle(exam.title);
    setSubjectName(exam.subject?.name ?? '');
    setExamDate(exam.examDate);
    setStartTime(exam.startTime);
    setEndTime(exam.endTime);
    setRoom(exam.room ?? '');
    setFormOpen(true);
  };

  const submit = async () => {
    try {
      await dispatch(
        saveExam({
          input: { title, subjectName, examDate, startTime, endTime, room },
          id: editingId ?? undefined,
        }),
      ).unwrap();
      setFormOpen(false);
    } catch (failure) {
      Alert.alert('Gagal menyimpan', errorMessage(failure));
    }
  };

  const run = (action: Promise<unknown>, label: string) => {
    action.catch((failure) => Alert.alert(label, errorMessage(failure)));
  };

  const confirmDelete = (exam: Exam) => {
    Alert.alert('Hapus ujian?', exam.title, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => run(dispatch(removeExam(exam.id)).unwrap(), 'Gagal menghapus'),
      },
    ]);
  };

  const confirmPublish = (exam: Exam) => {
    Alert.alert(
      'Publikasikan ujian?',
      'Jadwal yang sudah dipublikasikan tidak bisa diubah atau dihapus.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Publikasikan',
          onPress: () => run(dispatch(publishExam(exam.id)).unwrap(), 'Gagal mempublikasikan'),
        },
      ],
    );
  };

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

      {formOpen ? (
        <View style={[styles.form, { borderColor: theme.colors.border }]}>
          <Text style={[styles.formTitle, { color: theme.colors.text }]}>
            {editingId ? 'Ubah ujian' : 'Ujian baru'}
          </Text>
          <TextField
            label="Judul"
            value={title}
            onChangeText={setTitle}
            placeholder="Contoh: Ulangan harian Matematika"
            testID="exam-title"
          />
          <TextField
            label="Mata pelajaran"
            value={subjectName}
            onChangeText={setSubjectName}
            placeholder="Contoh: Matematika"
            testID="exam-subject"
          />
          <TextField
            label="Tanggal (YYYY-MM-DD)"
            value={examDate}
            onChangeText={setExamDate}
            placeholder="2026-11-05"
            autoCapitalize="none"
            testID="exam-date"
          />
          <View style={styles.timeRow}>
            <View style={styles.timeCell}>
              <TextField
                label="Mulai"
                value={startTime}
                onChangeText={setStartTime}
                placeholder="07:30"
                autoCapitalize="none"
                testID="exam-start"
              />
            </View>
            <View style={styles.timeCell}>
              <TextField
                label="Selesai"
                value={endTime}
                onChangeText={setEndTime}
                placeholder="09:00"
                autoCapitalize="none"
                testID="exam-end"
              />
            </View>
          </View>
          <TextField
            label="Ruang (opsional)"
            value={room}
            onChangeText={setRoom}
            placeholder="Ruang 12"
            testID="exam-room"
          />
          <PrimaryButton label="Simpan ujian" onPress={() => void submit()} />
          <PrimaryButton label="Batal" tone="ghost" onPress={() => setFormOpen(false)} />
        </View>
      ) : (
        <PrimaryButton label="Tambah ujian" onPress={openCreate} />
      )}

      {status !== 'loading' && data.length === 0 && !formOpen ? (
        <EmptyState title="Belum ada ujian" hint="Tekan “Tambah ujian” untuk mencatat jadwal." />
      ) : null}

      {data.map((exam) => {
        const until = exam.daysUntil ?? 0;
        const statusKey = until < 0 ? 'OVERDUE' : until === 0 ? 'TODAY' : 'UPCOMING';
        const locked = !!exam.isLocked;
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
              <StatusBadge status={statusKey} label={locked ? 'Terpublikasi' : 'Draf'} />
            </View>
            {!locked ? (
              <View style={styles.action}>
                <PrimaryButton
                  label="Publikasikan"
                  onPress={() => confirmPublish(exam)}
                  accessibilityHint="Mengunci jadwal ujian ini"
                />
              </View>
            ) : null}
            <CardActions
              onEdit={locked ? undefined : () => openEdit(exam)}
              onDelete={locked ? undefined : () => confirmDelete(exam)}
            />
            {locked ? (
              <Text style={[styles.locked, { color: theme.colors.textMuted }]}>
                Terkunci setelah dipublikasikan.
              </Text>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  date: { fontSize: 14, marginTop: 4 },
  row: { marginTop: 8 },
  action: { marginTop: 8 },
  form: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 10 },
  formTitle: { fontSize: 16, fontWeight: '700' },
  timeRow: { flexDirection: 'row', gap: 8 },
  timeCell: { flex: 1 },
  locked: { fontSize: 12, marginTop: 6 },
});
