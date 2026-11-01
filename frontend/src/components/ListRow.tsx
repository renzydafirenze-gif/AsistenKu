import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

interface ListRowProps {
  title: string;
  /** Second line: subject, time, teacher — keep it short. */
  meta?: string;
  /** Third line for free text such as a note. */
  detail?: string;
  /** Right-aligned label (date, duration, code). */
  trailing?: string;
  /** Colour of the thin leading rule; defaults to the accent. */
  tone?: string;
  onPress: () => void;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * The workhorse content row: one tap target, no nesting of buttons, hairline
 * separator so a group reads as a list instead of a stack of cards.
 */
export function ListRow({
  title,
  meta,
  detail,
  trailing,
  tone,
  onPress,
  accessibilityHint,
  testID,
}: ListRowProps) {
  const theme = useTheme();
  const accent = tone ?? theme.colors.primary;
  const label = [title, meta, trailing].filter(Boolean).join('. ');

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.colors.surface : 'transparent',
          borderBottomColor: theme.colors.border,
          minHeight: theme.touchTarget + 12,
          paddingVertical: theme.spacing(3),
        },
      ]}
    >
      <View style={[styles.rule, { backgroundColor: accent }]} />
      <View style={styles.text}>
        <Text style={[theme.typography.body, styles.title, { color: theme.colors.text }]} numberOfLines={2}>
          {title}
        </Text>
        {meta ? (
          <Text style={[theme.typography.label, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {detail ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View style={styles.tail}>
        {trailing ? (
          <Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>{trailing}</Text>
        ) : null}
        <Text style={[styles.chevron, { color: theme.colors.textFaint }]}>›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rule: { width: 3, height: 28, borderRadius: 2 },
  text: { flex: 1, gap: 2 },
  title: { fontWeight: '600' },
  tail: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chevron: { fontSize: 22 },
});
