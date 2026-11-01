import React, { useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';

import { RootNavigator } from './src/navigation/RootNavigator';
import { createStore } from './src/store';
import { restoreSession } from './src/store/authSlice';
import { ThemeProvider } from './src/theme/ThemeProvider';

export default function App() {
  // One store per app launch; remounting it would drop the in-flight refresh.
  const store = useMemo(() => createStore(), []);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void store
      .dispatch(restoreSession())
      .finally(() => {
        if (!cancelled) setBooted(true);
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <ThemeProvider>
          <StatusBar style="auto" />
          <RootNavigator booted={booted} />
        </ThemeProvider>
      </Provider>
    </SafeAreaProvider>
  );
}
