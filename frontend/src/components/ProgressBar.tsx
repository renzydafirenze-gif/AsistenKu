import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

interface ProgressBarProps {
  value: number;
  total: number;
  label: string;
}

/** Thin neutral track + accent fill; the text carries the actual numbers. */
export function ProgressBar({ value, total, label }: ProgressBarProps) {
  const theme = useTheme();
  const ratio = total > 0 ? Math.min(value / total, 1) : 0;
  return (
    <View style={styles.root} accessible accessibilityLabel={label}>
      <Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <View style={[styles.track, { backgroundColor: theme.colors.tint, borderRadius: theme.radius.pill }]}>
        <View
          testID="progress-fill"
          style={[
            styles.fill,
            {
              width: `${Math.round(ratio * 100)}%`,
              backgroundColor: ratio === 1 ? theme.colors.accent : theme.colors.primary,
              borderRadius: theme.radius.pill,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  track: { height: 8, overflow: 'hidden' },
  fill: { height: 8 },
});
