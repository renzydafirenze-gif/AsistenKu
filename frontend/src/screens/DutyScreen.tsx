import React, { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { EmptyState } from '../components/EmptyState';
import { Fab } from '../components/Fab';
import { ListRow } from '../components/ListRow';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { Sheet } from '../components/Sheet';
import { TextField } from '../components/TextField';
import type { Duty, DutyShift } from '../api/types';
import { todayKey } from '../offline/repository';
import { useAppDispatch, useAppSelector } from '../store';
import { completeDuty, refreshAll, removeDuty, saveDuty } from '../store/dataSlice';
import { useTheme } from '../theme/ThemeProvider';
import { STATUS_LABEL, statusTone } from '../theme/tokens';
import { formatIndonesianDay, shiftLabel } from '../utils/format';
import { groupByDay } from '../utils/group';

const SHIFTS: Array<{ value: DutyShift; label: string }> = [
  { value: 'MORNING', label: 'Pagi' },
  { value: 'AFTERNOON', label: 'Siang' },
];

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Perubahan tidak tersimpan.';
};

const emptyForm = () => ({
  date: todayKey(),
  shift: 'MORNING' as DutyShift,
  studentName: '',
  notes: '',
});

export function DutyScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((state) => state.data.duties);
  const userName = useAppSelector((state) => state.data.dashboard.data?.user.fullName ?? '');

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
    setForm({ ...emptyForm(), studentName: userName });
    setSheetOpen(true);
  };

  const openEdit = (duty: Duty) => {
    setEditingId(duty.id);
    setForm({
      date: duty.date,
      shift: duty.shift,
      studentName: duty.assignedStudentName ?? '',
      notes: duty.notes ?? '',
    });
    setSheetOpen(true);
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await dispatch(saveDuty({ input: form, id: editingId ?? undefined })).unwrap();
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
    Alert.alert('Hapus jadwal piket?', formatIndonesianDay(form.date), [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          setSheetOpen(false);
          dispatch(removeDuty(id))
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
      // Persist any edits before marking it done, so notes are not lost.
      await dispatch(saveDuty({ input: form, id: editingId })).unwrap();
      await dispatch(completeDuty(editingId)).unwrap();
      setSheetOpen(false);
    } catch (failure) {
      Alert.alert('Gagal menyimpan', errorMessage(failure));
    } finally {
      setSaving(false);
    }
  };

  const editing = editingId ? data.find((duty) => duty.id === editingId) : undefined;
  const groups = groupByDay(todayKey(), data, (duty) => duty.date);

  return (
    <Screen
      eyebrow="AsistenKu"
      title="Piket"
      subtitle={`${data.length} jadwal tersimpan`}
      refreshing={status === 'loading'}
      onRefresh={refresh}
      floating={
        <Fab label="Tambah piket" onPress={openCreate} accessibilityHint="Membuat jadwal piket baru" />
      }
    >
      {error ? <EmptyState title="Gagal memuat data" hint={error} icon="alert-circle-outline" /> : null}

      {status !== 'loading' && data.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="Belum ada jadwal piket"
          hint="Tambahkan jadwal pertama, lalu tandai selesai saat sudah dikerjakan."
        />
      ) : null}

      {groups.map((group) => (
        <React.Fragment key={group.title}>
          <SectionHeader title={group.title} aside={`${group.items.length}`} />
          {group.items.map((duty) => {
            const tone = statusTone(theme, duty.completedAt ? 'COMPLETED' : duty.status);
            return (
              <ListRow
                key={duty.id}
                testID={`duty-${duty.id}`}
                title={formatIndonesianDay(duty.date)}
                meta={`Shift ${shiftLabel(duty.shift)}${duty.assignedStudentName ? ` · ${duty.assignedStudentName}` : ''}`}
                detail={duty.notes ?? undefined}
                trailing={STATUS_LABEL[duty.completedAt ? 'COMPLETED' : (duty.status ?? '')] ?? 'Terjadwal'}
                tone={tone.background}
                onPress={() => openEdit(duty)}
                accessibilityHint="Membuka detail piket"
              />
            );
          })}
        </React.Fragment>
      ))}

      <Sheet
        visible={sheetOpen}
        title={editingId ? 'Ubah piket' : 'Piket baru'}
        onClose={() => setSheetOpen(false)}
        footer={
          <>
            <PrimaryButton label="Simpan piket" loading={saving} onPress={() => void submit()} />
            {editingId ? (
              <PrimaryButton label="Hapus" tone="ghost" onPress={remove} />
            ) : null}
          </>
        }
      >
        <TextField
          label="Tanggal (YYYY-MM-DD)"
          value={form.date}
          onChangeText={(date) => setForm((previous) => ({ ...previous, date }))}
          placeholder="2026-11-01"
          autoCapitalize="none"
          testID="duty-date"
        />
        <SegmentedControl
          accessibilityLabel="Shift piket"
          options={SHIFTS}
          value={form.shift}
          onChange={(shift) => setForm((previous) => ({ ...previous, shift }))}
        />
        <TextField
          label="Nama siswa"
          value={form.studentName}
          onChangeText={(studentName) => setForm((previous) => ({ ...previous, studentName }))}
          placeholder="Nama yang bertugas"
          testID="duty-student"
        />
        <TextField
          label="Catatan (opsional)"
          value={form.notes}
          onChangeText={(notes) => setForm((previous) => ({ ...previous, notes }))}
          placeholder="Contoh: sapu dan pel lantai"
          testID="duty-notes"
        />
        {editing?.canComplete ? (
          <PrimaryButton label="Tandai selesai" tone="ghost" loading={saving} onPress={() => void complete()} />
        ) : null}
      </Sheet>
    </Screen>
  );
}
