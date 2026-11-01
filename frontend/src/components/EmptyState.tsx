import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { PrimaryButton } from './PrimaryButton';
import { useTheme } from '../theme/ThemeProvider';

interface EmptyStateProps {
  title: string;
  hint?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  actionLabel?: string;
  onAction?: () => void;
}

/** Empty list surface: says why it is empty and offers the next step. */
export function EmptyState({ title, hint, icon = 'sparkles-outline', actionLabel, onAction }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={[styles.root, { padding: theme.spacing(6) }]}>
      <Ionicons name={icon} size={30} color={theme.colors.textFaint} />
      <Text
        accessibilityRole="text"
        style={[theme.typography.heading, styles.title, { color: theme.colors.text }]}
      >
        {title}
      </Text>
      {hint ? (
        <Text style={[theme.typography.body, styles.hint, { color: theme.colors.textMuted }]}>{hint}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <PrimaryButton label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 8 },
  title: { textAlign: 'center' },
  hint: { textAlign: 'center' },
  action: { alignSelf: 'stretch', marginTop: 8 },
});
