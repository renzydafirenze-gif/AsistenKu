import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence: a render crash shows a recoverable message instead of a
 * white screen. Data is untouched on disk, so "Coba lagi" simply remounts.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.root}>
        <Text accessibilityRole="header" style={styles.title}>
          Aplikasi berhenti sebentar
        </Text>
        <Text style={styles.body}>
          Data kamu tetap tersimpan di HP. Coba buka lagi layarnya.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Coba lagi"
          onPress={() => this.setState({ error: null })}
          style={styles.button}
        >
          <Text style={styles.buttonLabel}>Coba lagi</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', gap: 10, padding: 24, backgroundColor: '#FFFFFF' },
  title: { fontSize: 22, fontWeight: '700', color: '#141A21' },
  body: { fontSize: 16, lineHeight: 24, color: '#5A6672' },
  button: {
    marginTop: 8,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#1B5F8F',
  },
  buttonLabel: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
