import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';

import { EmptyState } from '../components/EmptyState';
import { Fab } from '../components/Fab';
import { ListRow } from '../components/ListRow';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';
import { Sheet } from '../components/Sheet';
import { TextField } from '../components/TextField';
import type { Exam } from '../api/types';
import { todayKey } from '../offline/repository';
import { useAppDispatch, useAppSelector } from '../store';
import { publishExam, refreshAll, removeExam, saveExam } from '../store/dataSlice';
import { useTheme } from '../theme/ThemeProvider';
import { formatIndonesianDay } from '../utils/format';
import { groupByDay } from '../utils/group';

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Perubahan tidak tersimpan.';
};

const emptyForm = () => ({
  title: '',
  subjectName: '',
  examDate: todayKey(),
  startTime: '07:30',
  endTime: '09:00',
  room: '',
});

export function ExamScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((state) => state.data.exams);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    void dispatch(refreshAll());
  }, [dispatch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setSheetOpen(true);
  };

  const openEdit = (exam: Exam) => {
    setEditingId(exam.id);
    setForm({
      title: exam.title,
      subjectName: exam.subject?.name ?? '',
      examDate: exam.examDate,
      startTime: exam.startTime,
      endTime: exam.endTime,
      room: exam.room ?? '',
    });
    setSheetOpen(true);
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await dispatch(saveExam({ input: form, id: editingId ?? undefined })).unwrap();
      setSheetOpen(false);
    } catch (failure) {
      Alert.alert('Gagal menyimpan', errorMessage(failure));
    } finally {
      setSaving(false);
    }
  };

  const publish = () => {
    if (!editingId) return;
    const id = editingId;
    Alert.alert(
      'Publikasikan ujian?',
      'Jadwal yang sudah dipublikasikan tidak bisa diubah atau dihapus.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Publikasikan',
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                // Save the visible fields first: publishing must lock what the
                // student just typed, not the previous stored version.
                await dispatch(saveExam({ input: form, id })).unwrap();
                await dispatch(publishExam(id)).unwrap();
                setSheetOpen(false);
              } catch (failure) {
                Alert.alert('Gagal mempublikasikan', errorMessage(failure));
              } finally {
                setSaving(false);
              }
            })();
          },
        },
      ],
    );
  };

  const remove = () => {
    if (!editingId) return;
    const id = editingId;
    Alert.alert('Hapus ujian?', form.title, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          setSheetOpen(false);
          dispatch(removeExam(id))
            .unwrap()
            .catch((failure) => Alert.alert('Gagal menghapus', errorMessage(failure)));
        },
      },
    ]);
  };

  const editing = editingId ? data.find((exam) => exam.id === editingId) : undefined;
  const locked = !!editing?.isLocked;
  const groups = groupByDay(todayKey(), data, (exam) => exam.examDate);

  return (
    <Screen
      eyebrow="AsistenKu"
      title="Ujian"
      subtitle="Jadwal yang dipublikasikan terkunci dan tidak bisa diubah."
      refreshing={status === 'loading'}
      onRefresh={refresh}
      floating={<Fab label="Tambah ujian" onPress={openCreate} accessibilityHint="Mencatat jadwal ujian" />}
    >
      {error ? <EmptyState title="Gagal memuat data" hint={error} icon="alert-circle-outline" /> : null}

      {status !== 'loading' && data.length === 0 ? (
        <EmptyState
          icon="school-outline"
          title="Belum ada ujian"
          hint="Catat tanggal, jam dan ruang ujian supaya tidak bentrok."
        />
      ) : null}

      {groups.map((group) => (
        <React.Fragment key={group.title}>
          <SectionHeader title={group.title} aside={`${group.items.length}`} />
          {group.items.map((exam) => (
            <ListRow
              key={exam.id}
              testID={`exam-${exam.id}`}
              title={exam.title}
              meta={`${exam.subject?.name ?? 'Mata pelajaran'} · ${exam.startTime}–${exam.endTime}${
                exam.room ? ` · ${exam.room}` : ''
              }`}
              detail={formatIndonesianDay(exam.examDate)}
              trailing={exam.isLocked ? 'Terpublikasi' : 'Draf'}
              tone={exam.isLocked ? theme.colors.accent : theme.colors.secondary}
              onPress={() => openEdit(exam)}
              accessibilityHint="Membuka detail ujian"
            />
          ))}
        </React.Fragment>
      ))}

      <Sheet
        visible={sheetOpen}
        title={editingId ? (locked ? 'Detail ujian' : 'Ubah ujian') : 'Ujian baru'}
        onClose={() => setSheetOpen(false)}
        footer={
          locked ? (
            <PrimaryButton label="Tutup" tone="ghost" onPress={() => setSheetOpen(false)} />
          ) : (
            <>
              <PrimaryButton label="Simpan ujian" loading={saving} onPress={() => void submit()} />
              {editingId ? (
                <>
                  <PrimaryButton label="Publikasikan" tone="ghost" loading={saving} onPress={publish} />
                  <PrimaryButton label="Hapus" tone="ghost" onPress={remove} />
                </>
              ) : null}
            </>
          )
        }
      >
        {locked ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
            Terkunci setelah dipublikasikan: {formatIndonesianDay(form.examDate)} · {form.startTime}–
            {form.endTime}
            {form.room ? ` · ${form.room}` : ''}
          </Text>
        ) : (
          <>
            <TextField
              label="Judul"
              value={form.title}
              onChangeText={(title) => setForm((previous) => ({ ...previous, title }))}
              placeholder="Contoh: Ulangan harian Matematika"
              testID="exam-title"
            />
            <TextField
              label="Mata pelajaran"
              value={form.subjectName}
              onChangeText={(subjectName) => setForm((previous) => ({ ...previous, subjectName }))}
              placeholder="Contoh: Matematika"
              testID="exam-subject"
            />
            <TextField
              label="Tanggal (YYYY-MM-DD)"
              value={form.examDate}
              onChangeText={(examDate) => setForm((previous) => ({ ...previous, examDate }))}
              placeholder="2026-11-05"
              autoCapitalize="none"
              testID="exam-date"
            />
            <TextField
              label="Mulai (HH:MM)"
              value={form.startTime}
              onChangeText={(startTime) => setForm((previous) => ({ ...previous, startTime }))}
              placeholder="07:30"
              autoCapitalize="none"
              testID="exam-start"
            />
            <TextField
              label="Selesai (HH:MM)"
              value={form.endTime}
              onChangeText={(endTime) => setForm((previous) => ({ ...previous, endTime }))}
              placeholder="09:00"
              autoCapitalize="none"
              testID="exam-end"
            />
            <TextField
              label="Ruang (opsional)"
              value={form.room}
              onChangeText={(room) => setForm((previous) => ({ ...previous, room }))}
              placeholder="Ruang 12"
              testID="exam-room"
            />
          </>
        )}
      </Sheet>
    </Screen>
  );
}
