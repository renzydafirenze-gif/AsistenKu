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
import type { Homework } from '../api/types';
import { todayKey } from '../offline/repository';
import { useAppDispatch, useAppSelector } from '../store';
import { completeHomework, refreshAll, removeHomework, saveHomework } from '../store/dataSlice';
import { useTheme } from '../theme/ThemeProvider';
import { brand } from '../theme/tokens';
import { formatIndonesianDate } from '../utils/format';
import { groupByDay } from '../utils/group';

const LATE = brand.danger;

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Perubahan tidak tersimpan.';
};

const emptyForm = () => ({ title: '', subjectName: '', dueDate: todayKey(), description: '' });

export function HomeworkScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((state) => state.data.homework);

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

  const openEdit = (homework: Homework) => {
    setEditingId(homework.id);
    setForm({
      title: homework.title,
      subjectName: homework.subject?.name ?? '',
      dueDate: homework.dueDate.slice(0, 10),
      description: homework.description ?? '',
    });
    setSheetOpen(true);
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await dispatch(saveHomework({ input: form, id: editingId ?? undefined })).unwrap();
      setSheetOpen(false);
    } catch (failure) {
      Alert.alert('Gagal menyimpan', errorMessage(failure));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!editingId) return;
    const id = editingId;
    Alert.alert('Hapus PR?', form.title, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          setSheetOpen(false);
          dispatch(removeHomework(id))
            .unwrap()
            .catch((failure) => Alert.alert('Gagal menghapus', errorMessage(failure)));
        },
      },
    ]);
  };

  const complete = async () => {
    if (!editingId || saving) return;
    setSaving(true);
    try {
      await dispatch(saveHomework({ input: form, id: editingId })).unwrap();
      await dispatch(completeHomework(editingId)).unwrap();
      setSheetOpen(false);
    } catch (failure) {
      Alert.alert('Gagal menyimpan', errorMessage(failure));
    } finally {
      setSaving(false);
    }
  };

  const editing = editingId ? data.find((item) => item.id === editingId) : undefined;
  const groups = groupByDay(todayKey(), data, (item) => item.dueDate.slice(0, 10));
  const lateCount = data.filter((item) => item.isLate).length;

  return (
    <Screen
      eyebrow="AsistenKu"
      title="Pekerjaan rumah"
      subtitle={
        data.length === 0
          ? 'Belum ada tugas tercatat'
          : `${data.length} tugas${lateCount > 0 ? ` · ${lateCount} terlambat` : ' · semua aman'}`
      }
      refreshing={status === 'loading'}
      onRefresh={refresh}
      floating={<Fab label="Tambah PR" onPress={openCreate} accessibilityHint="Mencatat PR baru" />}
    >
      {error ? <EmptyState title="Gagal memuat data" hint={error} icon="alert-circle-outline" /> : null}

      {status !== 'loading' && data.length === 0 ? (
        <EmptyState
          icon="book-outline"
          title="Belum ada PR"
          hint="Catat tugas beserta tenggatnya agar tidak terlewat."
        />
      ) : null}

      {groups.map((group) => (
        <React.Fragment key={group.title}>
          <SectionHeader title={group.title} aside={`${group.items.length}`} />
          {group.items.map((homework) => {
            const overdue = homework.isLate || homework.isOverdue;
            const submitted = homework.assignment?.status === 'SUBMITTED';
            const dueKey = homework.dueDate.slice(0, 10);
            const trailing = submitted ? (overdue ? 'Terlambat' : 'Selesai') : overdue ? 'Terlambat' : formatIndonesianDate(dueKey);
            return (
              <ListRow
                key={homework.id}
                testID={`homework-${homework.id}`}
                title={homework.title}
                meta={homework.subject?.name ?? 'Tanpa mapel'}
                detail={homework.description ?? undefined}
                trailing={trailing}
                tone={overdue ? LATE : theme.colors.primary}
                onPress={() => openEdit(homework)}
                accessibilityHint="Membuka detail PR"
              />
            );
          })}
        </React.Fragment>
      ))}

      <Sheet
        visible={sheetOpen}
        title={editingId ? 'Ubah PR' : 'PR baru'}
        onClose={() => setSheetOpen(false)}
        footer={
          <>
            <PrimaryButton label="Simpan PR" loading={saving} onPress={() => void submit()} />
            {editing && !editing.isLate ? (
              <PrimaryButton label="Hapus" tone="ghost" onPress={remove} />
            ) : null}
          </>
        }
      >
        {editing?.isLate ? (
          <Text style={[theme.typography.caption, { color: theme.colors.danger }]}>
            PR terlambat tidak bisa dihapus. Ubah tenggatnya kalau memang salah input.
          </Text>
        ) : null}
        <TextField
          label="Judul"
          value={form.title}
          onChangeText={(title) => setForm((previous) => ({ ...previous, title }))}
          placeholder="Contoh: Latihan pecahan halaman 42"
          testID="homework-title"
        />
        <TextField
          label="Mata pelajaran"
          value={form.subjectName}
          onChangeText={(subjectName) => setForm((previous) => ({ ...previous, subjectName }))}
          placeholder="Contoh: Matematika"
          testID="homework-subject"
        />
        <TextField
          label="Tenggat (YYYY-MM-DD)"
          value={form.dueDate}
          onChangeText={(dueDate) => setForm((previous) => ({ ...previous, dueDate }))}
          placeholder="2026-11-05"
          autoCapitalize="none"
          testID="homework-due"
        />
        <TextField
          label="Catatan (opsional)"
          value={form.description}
          onChangeText={(description) => setForm((previous) => ({ ...previous, description }))}
          placeholder="Detail tugas"
          testID="homework-description"
        />
        {editing && editing.assignment?.status !== 'SUBMITTED' ? (
          <PrimaryButton label="Tandai selesai" tone="ghost" loading={saving} onPress={() => void complete()} />
        ) : null}
      </Sheet>
    </Screen>
  );
}
