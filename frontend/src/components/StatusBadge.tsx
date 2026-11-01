import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { readableTextOn } from '../theme/contrast';
import { useTheme } from '../theme/ThemeProvider';
import { statusTone } from '../theme/tokens';

interface StatusBadgeProps {
  /** Raw server status, e.g. TODAY, OVERDUE, COMPLETE, #C0392B. */
  status?: string;
  label: string;
}

/** Colour-coded pill: green on time, yellow upcoming, red overdue. */
export function StatusBadge({ status, label }: StatusBadgeProps) {
  const theme = useTheme();
  const tone = statusTone(theme, status);
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Status ${label}`}
      style={[styles.badge, { backgroundColor: tone.background, borderRadius: theme.radius.sm }]}
    >
      <Text style={[styles.text, { color: readableTextOn(tone.background) }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4 },
  text: { fontSize: 12, fontWeight: '700' },
});
