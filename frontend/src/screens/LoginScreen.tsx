import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import type { AuthStackParams } from '../navigation/RootNavigator';
import { useAppDispatch, useAppSelector } from '../store';
import { enterOfflineMode, login } from '../store/authSlice';
import { useTheme } from '../theme/ThemeProvider';

type Props = NativeStackScreenProps<AuthStackParams, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector((state) => state.auth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const loading = status === 'loading';
  const canSubmit = email.includes('@') && password.length >= 8 && !loading;

  async function submit() {
    await dispatch(login({ email, password }));
  }

  return (
    <Screen title="Masuk" subtitle="Gunakan akun sekolahmu untuk melihat jadwal hari ini.">
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.colors.text }]}>Email</Text>
        <TextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          placeholder="nama@sekolah.sch.id"
          placeholderTextColor={theme.colors.textMuted}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              minHeight: theme.touchTarget,
              borderRadius: theme.radius.md,
            },
          ]}
        />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.colors.text }]}>Kata sandi</Text>
        <TextInput
          accessibilityLabel="Kata sandi"
          autoCapitalize="none"
          autoComplete="password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={() => void submit()}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              minHeight: theme.touchTarget,
              borderRadius: theme.radius.md,
            },
          ]}
        />
      </View>

      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[styles.error, { color: theme.colors.danger }]}
        >
          {error}
        </Text>
      ) : null}

      <PrimaryButton
        label="Masuk"
        onPress={() => void submit()}
        loading={loading}
        disabled={!canSubmit}
        accessibilityHint="Memeriksa akun lalu membuka dasbor"
      />

      <PrimaryButton
        tone="ghost"
        label="Belum punya akun? Daftar"
        onPress={() => navigation.navigate('Register')}
      />

      <PrimaryButton
        tone="ghost"
        label="Mode offline (data contoh)"
        onPress={() => void dispatch(enterOfflineMode())}
        accessibilityHint="Membuka jadwal contoh tanpa koneksi ke server"
      />
      <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
        Tanpa internet? Mode offline memakai data contoh yang tersimpan di HP. Perubahan piket dan
        seragam tetap tersimpan di perangkat ini.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600' },
  input: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, fontSize: 16 },
  error: { fontSize: 14 },
  hint: { fontSize: 12, lineHeight: 18 },
});
