import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Card } from '../components/Card';
import { CardActions } from '../components/CardActions';
import { EmptyState } from '../components/EmptyState';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import type { Subject } from '../api/types';
import { useAppDispatch, useAppSelector } from '../store';
import { refreshAll, removeSubject, saveSubject } from '../store/dataSlice';
import { useTheme } from '../theme/ThemeProvider';

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Perubahan tidak tersimpan.';
};

export function SubjectsScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((state) => state.data.subjects);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');

  const refresh = useCallback(() => {
    void dispatch(refreshAll());
  }, [dispatch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setCode('');
    setTeacherName('');
    setTeacherEmail('');
    setFormOpen(true);
  };

  const openEdit = (subject: Subject) => {
    setEditingId(subject.id);
    setName(subject.name);
    setCode(subject.code);
    setTeacherName(subject.teacher?.fullName ?? '');
    setTeacherEmail(subject.teacher?.email ?? '');
    setFormOpen(true);
  };

  const submit = async () => {
    try {
      await dispatch(
        saveSubject({
          input: { name, code, teacherName, teacherEmail },
          id: editingId ?? undefined,
        }),
      ).unwrap();
      setFormOpen(false);
    } catch (failure) {
      Alert.alert('Gagal menyimpan', errorMessage(failure));
    }
  };

  const confirmDelete = (subject: Subject) => {
    Alert.alert('Hapus mata pelajaran?', subject.name, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          dispatch(removeSubject(subject.id))
            .unwrap()
            .catch((failure) => Alert.alert('Gagal menghapus', errorMessage(failure)));
        },
      },
    ]);
  };

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

      {formOpen ? (
        <View style={[styles.form, { borderColor: theme.colors.border }]}>
          <Text style={[styles.formTitle, { color: theme.colors.text }]}>
            {editingId ? 'Ubah mapel' : 'Mapel baru'}
          </Text>
          <TextField
            label="Nama mapel"
            value={name}
            onChangeText={setName}
            placeholder="Contoh: Matematika"
            testID="subject-name"
          />
          <TextField
            label="Kode"
            value={code}
            onChangeText={setCode}
            placeholder="MTK"
            autoCapitalize="characters"
            maxLength={6}
            testID="subject-code"
          />
          <TextField
            label="Guru (opsional)"
            value={teacherName}
            onChangeText={setTeacherName}
            placeholder="Nama guru"
            testID="subject-teacher"
          />
          <TextField
            label="Email guru (opsional)"
            value={teacherEmail}
            onChangeText={setTeacherEmail}
            placeholder="guru@sekolah.id"
            keyboardType="email-address"
            autoCapitalize="none"
            testID="subject-email"
          />
          <PrimaryButton label="Simpan mapel" onPress={() => void submit()} />
          <PrimaryButton label="Batal" tone="ghost" onPress={() => setFormOpen(false)} />
        </View>
      ) : (
        <PrimaryButton label="Tambah mapel" onPress={openCreate} />
      )}

      {status !== 'loading' && data.length === 0 && !formOpen ? (
        <EmptyState title="Belum ada mata pelajaran" hint="Tekan “Tambah mapel” untuk memulai." />
      ) : null}

      {data.map((subject) => (
        <Card
          key={subject.id}
          testID={`subject-${subject.id}`}
          title={subject.name}
          subtitle={subject.teacher?.fullName || 'Guru belum ditetapkan'}
          badge={{ label: subject.code, color: theme.colors.primary }}
        >
          {subject.teacher?.email ? (
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
              {subject.teacher.email}
            </Text>
          ) : null}
          <CardActions onEdit={() => openEdit(subject)} onDelete={() => confirmDelete(subject)} />
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 13 },
  form: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 10 },
  formTitle: { fontSize: 16, fontWeight: '700' },
});
