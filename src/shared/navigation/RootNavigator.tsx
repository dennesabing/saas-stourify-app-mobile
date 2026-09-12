import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { StatusBar } from 'expo-status-bar'
import { navigationRef } from './ref'
import linking from './linking'
import { useAuthStore } from '@/shared/store/auth'
import { useOnboardingStore } from '@/shared/store/onboarding'
import { Icon, Text } from '@/shared/components/ui'
import HeroBackdrop from '@/features/auth/components/HeroBackdrop'
import ForgotPasswordScreen from '@/features/auth/screens/ForgotPasswordScreen'
import LoginScreen from '@/features/auth/screens/LoginScreen'
import RegisterScreen from '@/features/auth/screens/RegisterScreen'
import ResetPasswordScreen from '@/features/auth/screens/ResetPasswordScreen'
import WelcomeScreen from '@/features/auth/screens/WelcomeScreen'
import OnboardingNavigator from '@/features/onboarding/OnboardingNavigator'
import { useAppearanceStore } from '@/theme/appearance'
import { useTheme } from '@/theme/ThemeProvider'
import TabNavigator from './TabNavigator'
import type { RootStackParamList } from './types'

const Stack = createNativeStackNavigator<RootStackParamList>()

/**
 * Held until the stored token, the onboarding flag and the saved appearance
 * have been read.
 *
 * Without this gate the navigator renders on a `token` that is still null for
 * one frame, so every cold start of a signed-in app flashes the Login screen
 * before replacing it — the single most visible polish defect in the app. The
 * appearance joined the gate for the same reason (STOURIFY-290): read later,
 * an app set to Light on a dark phone would draw its first screen dark and then
 * flip.
 *
 * What it shows is the Auth & Entry design's SPLASH (STOURIFY-286): the
 * compass, the wordmark and the tagline on the brand gradient. It is still only
 * a gate — no minimum time, no timer. The canvas advances on a timer because it
 * is a demo; here the wordmark is on screen exactly as long as the reads take.
 * The canvas's shimmer bar is a spinner here: a looping animation on a screen
 * that is gone within a second would buy little and leave a timer running in
 * every test that renders this navigator.
 */
function Splash() {
  const theme = useTheme()

  return (
    <View testID="splash" style={{ flex: 1, backgroundColor: theme.colors.heroVia }}>
      <HeroBackdrop />
      <StatusBar style="light" />

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        <View
          style={{
            width: 104,
            height: 104,
            borderRadius: 30,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.heroTint,
            borderWidth: 1,
            borderColor: theme.colors.heroLine,
          }}
        >
          <Icon name="compass" size={52} color="onButton" strokeWidth={1.7} />
        </View>

        <View style={{ alignItems: 'center', gap: 10, paddingHorizontal: theme.gutter }}>
          <Text variant="display" color="onButton" style={{ fontSize: 46, lineHeight: 52 }}>
            Stourify
          </Text>
          <Text variant="bodyLg" color="onButton" style={{ fontSize: 16, opacity: 0.9 }}>
            Your local adventure starts here
          </Text>
        </View>
      </View>

      <View style={{ alignItems: 'center', paddingBottom: 64 }}>
        <ActivityIndicator color={theme.colors.onButton} />
      </View>
    </View>
  )
}

export default function RootNavigator() {
  const token = useAuthStore((state) => state.token)
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const shouldOnboard = useOnboardingStore((state) => state.shouldOnboard)
  const onboardingCompleted = useOnboardingStore((state) => state.completed)
  const loadOnboardingFromStorage = useOnboardingStore((state) => state.loadFromStorage)
  const loadAppearance = useAppearanceStore((state) => state.loadFromStorage)
  const [rehydrated, setRehydrated] = useState(false)

  useEffect(() => {
    let cancelled = false

    void Promise.all([loadFromStorage(), loadOnboardingFromStorage(), loadAppearance()]).finally(
      () => {
        if (!cancelled) setRehydrated(true)
      },
    )

    return () => {
      cancelled = true
    }
  }, [loadFromStorage, loadOnboardingFromStorage, loadAppearance])

  if (!rehydrated) return <Splash />

  // Set only by a successful registration (`RegisterScreen`), never by a
  // login — and cleared for good the instant the flag lands in storage, so a
  // later launch never replays it even though `shouldOnboard` itself resets
  // to `false` on every fresh boot regardless.
  const needsOnboarding = shouldOnboard && onboardingCompleted !== true

  return (
    <NavigationContainer ref={navigationRef} linking={linking} fallback={<Splash />}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {token ? (
          needsOnboarding ? (
            <Stack.Screen name="Onboarding" component={OnboardingNavigator} />
          ) : (
            <Stack.Screen name="MainTabs" component={TabNavigator} />
          )
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
