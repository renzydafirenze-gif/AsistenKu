import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeProvider';

interface FabProps {
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
  testID?: string;
}

/** Primary create action: bottom-right, above the tab bar, thumb reachable. */
export function Fab({ label, onPress, accessibilityHint, testID }: FabProps) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: theme.colors.primary,
          opacity: pressed ? 0.9 : 1,
          minWidth: 56,
          minHeight: 56,
        },
      ]}
    >
      <Ionicons name="add" size={26} color={theme.colors.onPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
});
