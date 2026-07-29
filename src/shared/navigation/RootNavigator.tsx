import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { navigationRef } from './ref'
import { useAuthStore } from '@/shared/store/auth'
import ForgotPasswordScreen from '@/features/auth/screens/ForgotPasswordScreen'
import LoginScreen from '@/features/auth/screens/LoginScreen'
import RegisterScreen from '@/features/auth/screens/RegisterScreen'
import ResetPasswordScreen from '@/features/auth/screens/ResetPasswordScreen'
import WelcomeScreen from '@/features/auth/screens/WelcomeScreen'
import { useTheme } from '@/theme/ThemeProvider'
import TabNavigator from './TabNavigator'
import type { RootStackParamList } from './types'

const Stack = createNativeStackNavigator<RootStackParamList>()

/**
 * Held until the stored token has been read.
 *
 * Without this gate the navigator renders on a `token` that is still null for
 * one frame, so every cold start of a signed-in app flashes the Login screen
 * before replacing it — the single most visible polish defect in the app.
 */
function Splash() {
  const theme = useTheme()

  return (
    <View
      testID="splash"
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface }}
    >
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  )
}

export default function RootNavigator() {
  const token = useAuthStore((state) => state.token)
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [rehydrated, setRehydrated] = useState(false)

  useEffect(() => {
    let cancelled = false

    void loadFromStorage().finally(() => {
      if (!cancelled) setRehydrated(true)
    })

    return () => {
      cancelled = true
    }
  }, [loadFromStorage])

  if (!rehydrated) return <Splash />

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {token ? (
          <Stack.Screen name="MainTabs" component={TabNavigator} />
        ) : (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
