import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type Theme } from './tokens';

interface ThemeOverride {
  theme?: Theme;
}

const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({
  children,
  theme,
}: React.PropsWithChildren<ThemeOverride>) {
  // `userInterfaceStyle: automatic` in app.json means the OS preference wins.
  const scheme = useColorScheme();
  const resolved = useMemo(
    () => theme ?? (scheme === 'dark' ? darkTheme : lightTheme),
    [scheme, theme],
  );
  return <ThemeContext.Provider value={resolved}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
