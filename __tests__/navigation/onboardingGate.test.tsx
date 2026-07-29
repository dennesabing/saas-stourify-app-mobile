import { render, screen, waitFor } from '@testing-library/react-native'
import RootNavigator from '@/shared/navigation/RootNavigator'
import { ThemeProvider } from '@/theme/ThemeProvider'

jest.mock('@/shared/navigation/TabNavigator', () => {
  const { Text } = require('react-native')
  return { __esModule: true, default: () => <Text>MAIN_TABS</Text> }
})

jest.mock('@/features/onboarding/OnboardingNavigator', () => {
  const { Text } = require('react-native')
  return { __esModule: true, default: () => <Text>ONBOARDING</Text> }
})

jest.mock('@/shared/store/auth', () => {
  const { create } = jest.requireActual('zustand')
  const useAuthStore = create((set: (partial: Record<string, unknown>) => void) => ({
    token: 'a-token',
    user: null,
    setToken: (token: string) => set({ token }),
    setUser: (user: unknown) => set({ user }),
    clearAuth: () => set({ token: null, user: null }),
    loadFromStorage: async () => undefined,
  }))
  return { __esModule: true, useAuthStore }
})

// A real zustand store, matching the shape of `useOnboardingStore`, but with a
// no-op `loadFromStorage` — the module's own AsyncStorage-backed one would
// otherwise race a test's preset `completed` value the instant it resolves.
jest.mock('@/shared/store/onboarding', () => {
  const { create } = jest.requireActual('zustand')
  const useOnboardingStore = create((set: (partial: Record<string, unknown>) => void) => ({
    shouldOnboard: false,
    completed: null,
    markRegistered: () => set({ shouldOnboard: true }),
    loadFromStorage: async () => undefined,
    complete: async () => set({ completed: true, shouldOnboard: false }),
  }))
  return { __esModule: true, useOnboardingStore }
})

import { useOnboardingStore } from '@/shared/store/onboarding'

function renderWithTheme() {
  return render(
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>,
  )
}

it('routes a freshly registered account into Onboarding, not straight to the feed', async () => {
  useOnboardingStore.setState({ shouldOnboard: true, completed: false })

  renderWithTheme()

  await waitFor(() => expect(screen.getByText('ONBOARDING')).toBeTruthy())
  expect(screen.queryByText('MAIN_TABS')).toBeNull()
})

it('an ordinary login never shows Onboarding, even before the completed flag has ever been written', async () => {
  useOnboardingStore.setState({ shouldOnboard: false, completed: false })

  renderWithTheme()

  await waitFor(() => expect(screen.getByText('MAIN_TABS')).toBeTruthy())
  expect(screen.queryByText('ONBOARDING')).toBeNull()
})

it('onboarding does not replay once its completed flag is set, even if shouldOnboard is still true', async () => {
  useOnboardingStore.setState({ shouldOnboard: true, completed: true })

  renderWithTheme()

  await waitFor(() => expect(screen.getByText('MAIN_TABS')).toBeTruthy())
  expect(screen.queryByText('ONBOARDING')).toBeNull()
})
