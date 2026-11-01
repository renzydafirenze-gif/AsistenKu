import React, { useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';

import { RootNavigator } from './src/navigation/RootNavigator';
import { createStore } from './src/store';
import { ThemeProvider } from './src/theme/ThemeProvider';

export default function App() {
  // One store per launch; all data lives on the device.
  const store = useMemo(() => createStore(), []);

  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <ThemeProvider>
          <StatusBar style="auto" />
          <RootNavigator />
        </ThemeProvider>
      </Provider>
    </SafeAreaProvider>
  );
}
