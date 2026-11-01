import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

interface ChecklistRowProps {
  label: string;
  category?: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: (checked: boolean) => void;
}

/**
 * Uniform checklist row. Uses `accessibilityRole="checkbox"` with
 * `accessibilityState` so screen readers announce the state, and keeps a
 * 48dp touch target.
 */
export function ChecklistRow({ label, category, checked, disabled, onToggle }: ChecklistRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={category ? `${label}, ${category}` : label}
      disabled={disabled}
      onPress={() => onToggle(!checked)}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: theme.touchTarget,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceRaised,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing(3),
          opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.box,
          {
            borderColor: checked ? theme.colors.accent : theme.colors.border,
            backgroundColor: checked ? theme.colors.accent : 'transparent',
          },
        ]}
      >
        {checked ? <Text style={styles.tick}>✓</Text> : null}
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
        {category ? (
          <Text style={[styles.category, { color: theme.colors.textMuted }]}>{category}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tick: { color: '#0B1F2A', fontWeight: '700' },
  textWrap: { flex: 1, gap: 2 },
  label: { fontSize: 16 },
  category: { fontSize: 12 },
});
