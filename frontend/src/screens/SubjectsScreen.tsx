import React, { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { EmptyState } from '../components/EmptyState';
import { Fab } from '../components/Fab';
import { ListRow } from '../components/ListRow';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';
import { Sheet } from '../components/Sheet';
import { TextField } from '../components/TextField';
import type { Subject } from '../api/types';
import { useAppDispatch, useAppSelector } from '../store';
import { refreshAll, removeSubject, saveSubject } from '../store/dataSlice';
import { errorHaptic, successHaptic } from '../utils/haptic';

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Perubahan tidak tersimpan.';
};

const emptyForm = () => ({ name: '', code: '', teacherName: '', teacherEmail: '' });

export function SubjectsScreen() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation<{ goBack?: () => void }>();
  const { data, status, error } = useAppSelector((state) => state.data.subjects);

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

  const openEdit = (subject: Subject) => {
    setEditingId(subject.id);
    setForm({
      name: subject.name,
      code: subject.code,
      teacherName: subject.teacher?.fullName ?? '',
      teacherEmail: subject.teacher?.email ?? '',
    });
    setSheetOpen(true);
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await dispatch(saveSubject({ input: form, id: editingId ?? undefined })).unwrap();
      successHaptic();
      setSheetOpen(false);
    } catch (failure) {
      errorHaptic();
      Alert.alert('Gagal menyimpan', errorMessage(failure));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!editingId) return;
    const id = editingId;
    Alert.alert('Hapus mata pelajaran?', form.name, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          setSheetOpen(false);
          dispatch(removeSubject(id))
            .unwrap()
            .then(() => successHaptic())
            .catch((failure) => {
              errorHaptic();
              Alert.alert('Gagal menghapus', errorMessage(failure));
            });
        },
      },
    ]);
  };

  // Grouped by first letter keeps a long subject list scannable.
  const groups = data.reduce<Array<{ title: string; items: Subject[] }>>((all, subject) => {
    const title = subject.name.slice(0, 1).toUpperCase();
    const bucket = all.find((group) => group.title === title);
    if (bucket) bucket.items.push(subject);
    else all.push({ title, items: [subject] });
    return all;
  }, []);

  return (
    <Screen
      title="Mata pelajaran"
      subtitle={`${data.length} mapel · guru pengampu`}
      onBack={navigation.goBack ? () => navigation.goBack!() : undefined}
      refreshing={status === 'loading'}
      onRefresh={refresh}
      floating={<Fab label="Tambah mapel" onPress={openCreate} accessibilityHint="Menambah mata pelajaran" />}
    >
      {error ? <EmptyState title="Gagal memuat data" hint={error} icon="alert-circle-outline" /> : null}

      {status !== 'loading' && data.length === 0 ? (
        <EmptyState
          icon="list-outline"
          title="Belum ada mata pelajaran"
          hint="Tambahkan mapel dan guru pengampunya."
        />
      ) : null}

      {groups.map((group) => (
        <React.Fragment key={group.title}>
          <SectionHeader title={group.title} />
          {group.items.map((subject) => (
            <ListRow
              key={subject.id}
              testID={`subject-${subject.id}`}
              title={subject.name}
              meta={subject.teacher?.fullName || 'Guru belum ditetapkan'}
              detail={subject.teacher?.email || undefined}
              trailing={subject.code}
              onPress={() => openEdit(subject)}
              accessibilityHint="Membuka detail mata pelajaran"
            />
          ))}
        </React.Fragment>
      ))}

      <Sheet
        visible={sheetOpen}
        title={editingId ? 'Ubah mapel' : 'Mapel baru'}
        onClose={() => setSheetOpen(false)}
        footer={
          <>
            <PrimaryButton label="Simpan mapel" loading={saving} onPress={() => void submit()} />
            {editingId ? <PrimaryButton label="Hapus" tone="ghost" onPress={remove} /> : null}
          </>
        }
      >
        <TextField
          label="Nama mapel"
          value={form.name}
          onChangeText={(name) => setForm((previous) => ({ ...previous, name }))}
          placeholder="Contoh: Matematika"
          testID="subject-name"
        />
        <TextField
          label="Kode"
          value={form.code}
          onChangeText={(code) => setForm((previous) => ({ ...previous, code }))}
          placeholder="MTK"
          autoCapitalize="characters"
          maxLength={6}
          testID="subject-code"
        />
        <TextField
          label="Guru (opsional)"
          value={form.teacherName}
          onChangeText={(teacherName) => setForm((previous) => ({ ...previous, teacherName }))}
          placeholder="Nama guru"
          testID="subject-teacher"
        />
        <TextField
          label="Email guru (opsional)"
          value={form.teacherEmail}
          onChangeText={(teacherEmail) => setForm((previous) => ({ ...previous, teacherEmail }))}
          placeholder="guru@sekolah.id"
          keyboardType="email-address"
          autoCapitalize="none"
          testID="subject-email"
        />
      </Sheet>
    </Screen>
  );
}
