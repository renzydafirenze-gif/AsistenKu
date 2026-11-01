import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

interface SegmentedControlProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}

/** 2–5 mutually exclusive options, thumb-sized, one tap each. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.root, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              {
                minHeight: theme.touchTarget,
                backgroundColor: selected ? theme.colors.primary : 'transparent',
                borderRadius: theme.radius.sm,
              },
            ]}
          >
            <Text
              style={[
                theme.typography.label,
                { color: selected ? theme.colors.onPrimary : theme.colors.textMuted },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', gap: 4, padding: 4, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
