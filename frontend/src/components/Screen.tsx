import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';

interface ScreenProps {
  title: string;
  subtitle?: string;
  /** Rendered opposite the title, e.g. a sign-out action. */
  headerAccessory?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}

/** Screen scaffold: safe-area aware, theme-aware, scrollable by default. */
export function Screen({
  title,
  subtitle,
  headerAccessory,
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const header = (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text
            accessibilityRole="header"
            accessibilityLabel={title}
            style={[styles.title, { color: theme.colors.text }]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
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
            { paddingBottom: insets.bottom + theme.spacing(6) },
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 12 },
  header: { paddingTop: 8, paddingBottom: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { flex: 1 },
  title: { fontSize: 26, fontWeight: '700' },
  subtitle: { fontSize: 14, marginTop: 2 },
});
