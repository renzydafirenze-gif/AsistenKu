import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: 'primary' | 'danger' | 'ghost';
  accessibilityHint?: string;
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  tone = 'primary',
  accessibilityHint,
}: PrimaryButtonProps) {
  const theme = useTheme();
  const inactive = disabled || loading;
  const background =
    tone === 'danger' ? theme.colors.danger : tone === 'ghost' ? 'transparent' : theme.colors.primary;
  const foreground =
    tone === 'danger'
      ? theme.colors.onDanger
      : tone === 'ghost'
        ? theme.colors.primaryText
        : theme.colors.onPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: theme.touchTarget,
          backgroundColor: background,
          borderColor: tone === 'ghost' ? theme.colors.border : background,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing(5),
          opacity: inactive ? 0.6 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <Text style={[styles.label, { color: foreground }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 16, fontWeight: '600' },
});
