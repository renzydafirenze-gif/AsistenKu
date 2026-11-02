import React, { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import type { UniformPlan } from '../api/types';
import { EmptyState } from '../components/EmptyState';
import { Fab } from '../components/Fab';
import { ListRow } from '../components/ListRow';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { Sheet } from '../components/Sheet';
import { TextField } from '../components/TextField';
import { useAppDispatch, useAppSelector } from '../store';
import { refreshAll, removeUniformPlan, saveUniformPlan } from '../store/dataSlice';
import { errorHaptic, successHaptic } from '../utils/haptic';
import { formatDateKey, formatIndonesianDay } from '../utils/format';

/** Monday-first weekday labels; index is `Date.getDay()` after the shift. */
const DAYS = [
  { value: '1', label: 'Sen' },
  { value: '2', label: 'Sel' },
  { value: '3', label: 'Rab' },
  { value: '4', label: 'Kam' },
  { value: '5', label: 'Jum' },
  { value: '6', label: 'Sab' },
  { value: '0', label: 'Min' },
];

const DAY_NAMES: Record<number, string> = {
  0: 'Minggu',
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu',
};

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Perubahan tidak tersimpan.';
};

const emptyForm = (dayOfWeek: number) => ({ dayOfWeek, label: '', detail: '' });

export function UniformScreen() {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((state) => state.data.uniform);
  const today = new Date();
  const todayDay = today.getDay();
  const todayLabel = formatIndonesianDay(formatDateKey(today));

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm(todayDay));
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    void dispatch(refreshAll());
  }, [dispatch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const plans = data ?? [];
  const todayPlan = plans.find((plan) => plan.dayOfWeek === todayDay) ?? null;
  // Today is already pinned above, so the rest of the week follows it.
  const week: UniformPlan[] = plans.filter((plan) => plan.dayOfWeek !== todayDay);

  const openCreate = () => {
    const freeDay = [1, 2, 3, 4, 5, 6, 0].find((day) => !plans.some((plan) => plan.dayOfWeek === day));
    setEditingId(null);
    setForm(emptyForm(freeDay ?? todayDay));
    setSheetOpen(true);
  };

  const openEdit = (plan: UniformPlan) => {
    setEditingId(plan.id);
    setForm({ dayOfWeek: plan.dayOfWeek, label: plan.label, detail: plan.detail ?? '' });
    setSheetOpen(true);
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await dispatch(
        saveUniformPlan({ input: form, id: editingId ?? undefined }),
      ).unwrap();
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
    Alert.alert('Hapus jadwal seragam?', DAY_NAMES[form.dayOfWeek], [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          setSheetOpen(false);
          dispatch(removeUniformPlan(id))
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

  return (
    <Screen
      eyebrow="AsistenKu"
      title="Seragam"
      subtitle={`${todayLabel} · pengingat harian`}
      refreshing={status === 'loading'}
      onRefresh={refresh}
      floating={
        <Fab label="Tambah seragam" onPress={openCreate} accessibilityHint="Menambah jadwal seragam" />
      }
    >
      {error ? <EmptyState title="Gagal memuat data" hint={error} icon="alert-circle-outline" /> : null}

      {plans.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Jadwal seragam masih kosong"
          hint="Tiap sekolah beda. Isi seragam untuk tiap hari sesuai aturan sekolahmu."
        />
      ) : null}

      {plans.length > 0 ? <SectionHeader title="Hari ini" /> : null}
      {plans.length > 0 && todayPlan ? (
        <ListRow
          testID="uniform-today"
          title={todayPlan.label}
          meta={DAY_NAMES[todayPlan.dayOfWeek]}
          detail={todayPlan.detail ?? undefined}
          onPress={() => openEdit(todayPlan)}
          accessibilityHint="Mengubah seragam hari ini"
        />
      ) : null}
      {plans.length > 0 && !todayPlan ? (
        <EmptyState
          icon="shirt-outline"
          title="Belum diatur untuk hari ini"
          hint="Tambahkan seragam yang kamu pakai hari ini."
        />
      ) : null}

      {week.length > 0 ? <SectionHeader title="Hari lain" aside={`${week.length} hari diatur`} /> : null}
      {week.map((plan) => (
        <ListRow
          key={plan.id}
          title={plan.label}
          meta={DAY_NAMES[plan.dayOfWeek]}
          detail={plan.detail ?? undefined}
          onPress={() => openEdit(plan)}
          accessibilityHint="Mengubah jadwal seragam"
        />
      ))}

      <Sheet
        visible={sheetOpen}
        title={editingId ? 'Ubah seragam' : 'Tambah seragam'}
        onClose={() => setSheetOpen(false)}
      >
        <SegmentedControl
          options={DAYS}
          value={String(form.dayOfWeek)}
          onChange={(value) => setForm({ ...form, dayOfWeek: Number(value) })}
          accessibilityLabel="Hari pemakaian seragam"
        />
        <TextField
          label="Nama seragam"
          value={form.label}
          onChangeText={(label) => setForm({ ...form, label })}
          placeholder="Contoh: Putih–Biru, Batik, Pramuka"
          autoCapitalize="words"
        />
        <TextField
          label="Rincian (opsional)"
          value={form.detail}
          onChangeText={(detail) => setForm({ ...form, detail })}
          placeholder="Contoh: kemeja putih, celana biru, dasi"
        />
        <PrimaryButton
          label={saving ? 'Menyimpan…' : 'Simpan'}
          onPress={submit}
          loading={saving}
          disabled={saving}
        />
        {editingId ? <PrimaryButton label="Hapus" tone="danger" onPress={remove} /> : null}
      </Sheet>
    </Screen>
  );
}
