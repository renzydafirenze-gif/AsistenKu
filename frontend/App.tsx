import React, { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';

import { ErrorBoundary } from './src/components/ErrorBoundary';
import { RootNavigator } from './src/navigation/RootNavigator';
import { createStore } from './src/store';
import { refreshAll } from './src/store/dataSlice';
import { ThemeProvider } from './src/theme/ThemeProvider';

export default function App() {
  // One store per launch; all data lives on the device.
  const store = useMemo(() => createStore(), []);

  useEffect(() => {
    // Coming back after midnight must not show yesterday's dates or ticks.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void store.dispatch(refreshAll());
    });
    return () => subscription.remove();
  }, [store]);

  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <ThemeProvider>
          <StatusBar style="auto" />
          <ErrorBoundary>
            <RootNavigator />
          </ErrorBoundary>
        </ThemeProvider>
      </Provider>
    </SafeAreaProvider>
  );
}
