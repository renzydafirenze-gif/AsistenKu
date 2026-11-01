import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

interface EmptyStateProps {
  title: string;
  hint?: string;
}

/** Shown when a list has no rows; also the loading/error fallback surface. */
export function EmptyState({ title, hint }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={[styles.root, { padding: theme.spacing(6) }]} accessible accessibilityRole="text">
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {hint ? (
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 6 },
  title: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  hint: { fontSize: 14, textAlign: 'center' },
});
