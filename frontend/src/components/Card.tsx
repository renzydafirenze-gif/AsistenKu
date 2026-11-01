import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { readableTextOn } from '../theme/contrast';
import { useTheme } from '../theme/ThemeProvider';

export interface CardProps {
  title: string;
  subtitle?: string;
  /** Short status label; announced with the card by screen readers. */
  badge?: { label: string; color: string } | null;
  /** Left rule colour; defaults to the theme primary. */
  tone?: string;
  onPress?: () => void;
  accessibilityHint?: string;
  children?: React.ReactNode;
  testID?: string;
}

/**
 * Colour-coded schedule card. The left rule carries the tone, so status is not
 * conveyed by colour alone, and the whole card is one accessible touch target.
 */
export function Card({
  title,
  subtitle,
  badge,
  tone,
  onPress,
  accessibilityHint,
  children,
  testID,
}: CardProps) {
  const theme = useTheme();
  const accent = tone ?? theme.colors.primary;
  const accessibilityLabel = badge
    ? `${title}${subtitle ? `. ${subtitle}` : ''}. Status ${badge.label}`
    : `${title}${subtitle ? `. ${subtitle}` : ''}`;

  const content = (
    <View
      style={[
        styles.inner,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          padding: theme.spacing(4),
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={2}>
          {title}
        </Text>
        {badge ? (
          <View
            style={[
              styles.badge,
              { backgroundColor: badge.color, borderRadius: theme.radius.sm },
            ]}
          >
            <Text style={[styles.badgeText, { color: readableTextOn(badge.color) }]}>
              {badge.label}
            </Text>
          </View>
        ) : null}
      </View>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
      ) : null}
      {children}
    </View>
  );

  const shell = (
    <View testID={testID} style={[styles.shell, { borderLeftColor: accent }]}>
      {content}
    </View>
  );

  if (!onPress) return shell;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      {shell}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: { borderLeftWidth: 5, borderRadius: 12, overflow: 'hidden' },
  inner: { borderWidth: StyleSheet.hairlineWidth, gap: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '600' },
  subtitle: { fontSize: 14 },
  badge: { paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
});
