import React from 'react';
import { NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { DashboardScreen } from '../screens/DashboardScreen';
import { DutyScreen } from '../screens/DutyScreen';
import { ExamScreen } from '../screens/ExamScreen';
import { HomeworkScreen } from '../screens/HomeworkScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { UniformScreen } from '../screens/UniformScreen';
import { useAppSelector } from '../store';
import type { Theme } from '../theme/tokens';

export type AuthStackParams = { Login: undefined; Register: undefined };
export type MainTabParams = {
  Dashboard: undefined;
  Duty: undefined;
  Homework: undefined;
  Exam: undefined;
  Uniform: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParams>();
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

function AuthFlow() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function MainFlow() {
  const theme = useTheme();
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        // Screens render lazily, so the app boots with one API call, not five.
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
  );
}

export function RootNavigator({ booted }: { booted: boolean }) {
  const theme = useTheme();
  const user = useAppSelector((state) => state.auth.user);

  if (!booted) {
    return (
      <View
        testID="boot-splash"
        accessibilityRole="progressbar"
        accessibilityLabel="Memuat sesi"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: theme.colors.background }}
      >
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={{ color: theme.colors.textMuted }}>Menyiapkan jadwalmu…</Text>
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme(theme)}>
      {user ? <MainFlow /> : <AuthFlow />}
    </NavigationContainer>
  );
}
