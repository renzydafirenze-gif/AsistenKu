import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import type { AuthStackParams } from '../navigation/RootNavigator';
import { useAppDispatch, useAppSelector } from '../store';
import { register } from '../store/authSlice';
import { useTheme } from '../theme/ThemeProvider';

type Props = NativeStackScreenProps<AuthStackParams, 'Register'>;

/** Student self-registration. Staff accounts need an invite code. */
export function RegisterScreen({ navigation }: Props) {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector((state) => state.auth);
  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [inviteCode, setInviteCode] = React.useState('');

  const loading = status === 'loading';
  const canSubmit =
    fullName.trim().length > 1 &&
    email.includes('@') &&
    password.length >= 8 &&
    /\d/.test(password) &&
    !loading;

  async function submit() {
    await dispatch(
      register({
        fullName: fullName.trim(),
        email,
        password,
        ...(inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}),
      }),
    );
  }

  const inputStyle = [
    styles.input,
    {
      color: theme.colors.text,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      minHeight: theme.touchTarget,
      borderRadius: theme.radius.md,
    },
  ];

  return (
    <Screen title="Daftar" subtitle="Akun siswa langsung aktif setelah didaftarkan.">
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.colors.text }]}>Nama lengkap</Text>
        <TextInput
          accessibilityLabel="Nama lengkap"
          autoCapitalize="words"
          value={fullName}
          onChangeText={setFullName}
          style={inputStyle}
        />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.colors.text }]}>Email</Text>
        <TextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
          style={inputStyle}
        />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.colors.text }]}>Kata sandi</Text>
        <TextInput
          accessibilityLabel="Kata sandi"
          accessibilityHint="Minimal 8 karakter dan mengandung angka"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={inputStyle}
        />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.colors.text }]}>
          Kode undangan (khusus guru)
        </Text>
        <TextInput
          accessibilityLabel="Kode undangan"
          autoCapitalize="none"
          value={inviteCode}
          onChangeText={setInviteCode}
          style={inputStyle}
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
        label="Buat akun"
        onPress={() => void submit()}
        loading={loading}
        disabled={!canSubmit}
      />
      <PrimaryButton tone="ghost" label="Sudah punya akun? Masuk" onPress={() => navigation.goBack()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600' },
  input: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, fontSize: 16 },
  error: { fontSize: 14 },
});
