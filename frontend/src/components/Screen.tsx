import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';

interface ScreenProps {
  title: string;
  subtitle?: string;
  /** Small label above the title, e.g. the app name or a section. */
  eyebrow?: string;
  /** Rendered opposite the title, e.g. a settings action. */
  headerAccessory?: React.ReactNode;
  /** Shows a back affordance (stack screens only). */
  onBack?: () => void;
  /** Fixed bottom-right action, e.g. a FAB. */
  floating?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}

/** Screen scaffold: safe-area aware, theme-aware, scrollable by default. */
export function Screen({
  title,
  subtitle,
  eyebrow,
  headerAccessory,
  onBack,
  floating,
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const header = (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kembali"
          onPress={onBack}
          style={styles.back}
        >
          <Text style={[theme.typography.label, { color: theme.colors.primaryText }]}>‹ Kembali</Text>
        </Pressable>
      ) : null}
      {eyebrow ? (
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>{eyebrow.toUpperCase()}</Text>
      ) : null}
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text
            accessibilityRole="header"
            accessibilityLabel={title}
            style={[theme.typography.display, { color: theme.colors.text }]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>{subtitle}</Text>
          ) : null}
        </View>
        {headerAccessory}
      </View>
    </View>
  );

  const body = (
    <>
      {header}
      {children}
    </>
  );

  return (
    <View
      testID="screen"
      style={[styles.root, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + theme.spacing(16) },
          ]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.primary}
                colors={[theme.colors.primary]}
                accessibilityLabel="Muat ulang"
              />
            ) : undefined
          }
        >
          {body}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.flex]}>{body}</View>
      )}
      {floating}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 8 },
  header: { paddingTop: 12, paddingBottom: 8, gap: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerText: { flex: 1 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  back: { paddingVertical: 6, alignSelf: 'flex-start' },
});
