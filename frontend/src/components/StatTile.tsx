import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
  onPress?: () => void;
  testID?: string;
}

/** Compact at-a-glance number used on the dashboard. */
export function StatTile({ label, value, hint, tone, onPress, testID }: StatTileProps) {
  const theme = useTheme();
  const accent = tone ?? theme.colors.primary;

  const body = (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          padding: theme.spacing(2),
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[theme.typography.title, styles.value, { color: theme.colors.text }]}
        numberOfLines={2}
      >
        {value}
      </Text>
      {hint ? (
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]} numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${hint ? `. ${hint}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.cell, { opacity: pressed ? 0.85 : 1 }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: { flex: 1 },
  root: { flex: 1, gap: 2, borderWidth: StyleSheet.hairlineWidth },
  dot: { width: 10, height: 10, borderRadius: 5, marginBottom: 2 },
  value: { fontSize: 20, lineHeight: 26 },
});
