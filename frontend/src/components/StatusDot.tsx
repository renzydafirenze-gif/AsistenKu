import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { STATUS_LABEL, statusTone } from '../theme/tokens';

interface StatusDotProps {
  status?: string;
  /** Overrides the default Indonesian label for the status. */
  label?: string;
}

/**
 * Small coloured dot plus a written label. Status is never colour alone, so
 * screen readers and colour-blind users get the same information.
 */
export function StatusDot({ status, label }: StatusDotProps) {
  const theme = useTheme();
  const tone = statusTone(theme, status);
  const text = label ?? STATUS_LABEL[status ?? ''] ?? 'Terjadwal';
  return (
    <View accessible accessibilityLabel={`Status ${text}`} style={styles.root}>
      <View style={[styles.dot, { backgroundColor: tone.background }]} />
      <Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
