import React from 'react';
import { NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { DashboardScreen } from '../screens/DashboardScreen';
import { DutyScreen } from '../screens/DutyScreen';
import { ExamScreen } from '../screens/ExamScreen';
import { HomeworkScreen } from '../screens/HomeworkScreen';
import { SubjectsScreen } from '../screens/SubjectsScreen';
import { UniformScreen } from '../screens/UniformScreen';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/tokens';

export type MainTabParams = {
  Dashboard: undefined;
  Duty: undefined;
  Homework: undefined;
  Exam: undefined;
  Uniform: undefined;
  Subjects: undefined;
};

const Tabs = createBottomTabNavigator<MainTabParams>();

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: Array<{
  name: keyof MainTabParams;
  title: string;
  a11y: string;
  icon: IconName;
  iconFocused: IconName;
  component: React.ComponentType;
}> = [
  { name: 'Dashboard', title: 'Beranda', a11y: 'Beranda', icon: 'home-outline', iconFocused: 'home', component: DashboardScreen },
  { name: 'Duty', title: 'Piket', a11y: 'Jadwal piket', icon: 'people-outline', iconFocused: 'people', component: DutyScreen },
  { name: 'Homework', title: 'PR', a11y: 'Pekerjaan rumah', icon: 'book-outline', iconFocused: 'book', component: HomeworkScreen },
  { name: 'Exam', title: 'Ujian', a11y: 'Jadwal ujian', icon: 'school-outline', iconFocused: 'school', component: ExamScreen },
  { name: 'Uniform', title: 'Seragam', a11y: 'Checklist seragam', icon: 'shirt-outline', iconFocused: 'shirt', component: UniformScreen },
  { name: 'Subjects', title: 'Mapel', a11y: 'Mata pelajaran', icon: 'list-outline', iconFocused: 'list', component: SubjectsScreen },
];

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
          tabBarLabelStyle: { fontSize: 11 },
        }}
      >
        {TABS.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            component={tab.component}
            options={{
              title: tab.title,
              tabBarAccessibilityLabel: tab.a11y,
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons name={focused ? tab.iconFocused : tab.icon} color={color} size={size} />
              ),
            }}
          />
        ))}
      </Tabs.Navigator>
    </NavigationContainer>
  );
}
