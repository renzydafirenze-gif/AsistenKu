import React from 'react';
import { NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { DashboardScreen } from '../screens/DashboardScreen';
import { DutyScreen } from '../screens/DutyScreen';
import { ExamScreen } from '../screens/ExamScreen';
import { HomeworkScreen } from '../screens/HomeworkScreen';
import { UniformScreen } from '../screens/UniformScreen';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/tokens';

export type MainTabParams = {
  Dashboard: undefined;
  Duty: undefined;
  Homework: undefined;
  Exam: undefined;
  Uniform: undefined;
};

const Tabs = createBottomTabNavigator<MainTabParams>();

function navTheme(theme: Theme): NavTheme {
  const { colors } = theme;
  return {
    dark: theme.mode === 'dark',
    colors: {
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.secondary,
    },
  };
}

/** No auth stack: the app opens straight on the local dashboard. */
export function RootNavigator() {
  const theme = useTheme();
  return (
    <NavigationContainer theme={navTheme(theme)}>
      <Tabs.Navigator
        screenOptions={{
          headerShown: false,
          // Screens render lazily, so a cold start reads the dataset once.
          lazy: true,
          tabBarActiveTintColor: theme.colors.primaryText,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            minHeight: theme.touchTarget + 12,
          },
          tabBarLabelStyle: { fontSize: 12 },
        }}
      >
        <Tabs.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ title: 'Dasbor', tabBarAccessibilityLabel: 'Dasbor' }}
        />
        <Tabs.Screen
          name="Duty"
          component={DutyScreen}
          options={{ title: 'Piket', tabBarAccessibilityLabel: 'Jadwal piket' }}
        />
        <Tabs.Screen
          name="Homework"
          component={HomeworkScreen}
          options={{ title: 'PR', tabBarAccessibilityLabel: 'Pekerjaan rumah' }}
        />
        <Tabs.Screen
          name="Exam"
          component={ExamScreen}
          options={{ title: 'Ujian', tabBarAccessibilityLabel: 'Jadwal ujian' }}
        />
        <Tabs.Screen
          name="Uniform"
          component={UniformScreen}
          options={{ title: 'Seragam', tabBarAccessibilityLabel: 'Checklist seragam' }}
        />
      </Tabs.Navigator>
    </NavigationContainer>
  );
}
