import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

import { selectionHaptic } from '../utils/haptic';

interface ChecklistRowProps {
  label: string;
  category?: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: (checked: boolean) => void;
}

/**
 * Uniform checklist row: `accessibilityRole="checkbox"` plus state, a 48dp
 * target, and a checkbox glyph so the state never depends on colour alone.
 */
export function ChecklistRow({ label, category, checked, disabled, onToggle }: ChecklistRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={category ? `${label}, ${category}` : label}
      disabled={disabled}
      onPress={() => {
        selectionHaptic();
        onToggle(!checked);
      }}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: theme.touchTarget + 8,
          borderBottomColor: theme.colors.border,
          paddingVertical: theme.spacing(3),
          opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.box,
          {
            borderColor: checked ? theme.colors.accent : theme.colors.border,
            backgroundColor: checked ? theme.colors.accent : 'transparent',
            borderRadius: theme.radius.sm,
          },
        ]}
      >
        {checked ? <View style={[styles.tick, { backgroundColor: theme.colors.onAccent }]} /> : null}
      </View>
      <Text style={[theme.typography.body, styles.label, { color: theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  box: { width: 22, height: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tick: { width: 10, height: 10, borderRadius: 2 },
  label: { flex: 1, fontWeight: '500' },
});
