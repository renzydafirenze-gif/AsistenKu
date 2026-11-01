import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

interface SectionHeaderProps {
  title: string;
  /** Small count or hint on the right, e.g. "3 tugas". */
  aside?: string;
}

/** Uppercase micro-heading that separates groups inside a list. */
export function SectionHeader({ title, aside }: SectionHeaderProps) {
  const theme = useTheme();
  return (
    <View style={styles.root}>
      <Text style={[styles.title, { color: theme.colors.textMuted }]}>{title.toUpperCase()}</Text>
      {aside ? (
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{aside}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 2,
  },
  title: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
});
