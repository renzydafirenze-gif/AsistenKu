import React from 'react';
import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
  testID?: string;
}

/** Labelled input with a visible border and a 48dp touch area. */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = 'sentences',
  maxLength,
  testID,
}: TextFieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.root}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        maxLength={maxLength}
        style={[
          styles.input,
          {
            minHeight: theme.touchTarget,
            color: theme.colors.text,
            backgroundColor: theme.colors.surfaceRaised,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.spacing(3),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 4 },
  label: { fontSize: 13, fontWeight: '600' },
  input: { fontSize: 16, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
});
