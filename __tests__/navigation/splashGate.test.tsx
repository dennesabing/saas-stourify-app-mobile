import { render, screen, waitFor } from '@testing-library/react-native'
import RootNavigator from '@/shared/navigation/RootNavigator'
import { ThemeProvider } from '@/theme/ThemeProvider'

jest.mock('@/shared/navigation/TabNavigator', () => {
  const { Text } = require('react-native')
  return { __esModule: true, default: () => <Text>MAIN_TABS</Text> }
})

// `useAuthStore` is captured per-render in `RootNavigator` (selector usage), so
// `jest.spyOn(useAuthStore.getState(), 'loadFromStorage')` on the real store does
// not reliably intercept the call the component makes. Mock the whole module
// instead, backed by a real zustand store so selector subscriptions still work,
// with a `loadFromStorage` this test controls directly.
//
// Variables prefixed `mock` are allowed inside `jest.mock` factories (jest hoists
// the factory above the import statements but special-cases `mock*` bindings).
const mockLoaded = { current: null as unknown as Promise<void> }
const mockResolveLoad = { current: (() => {}) as () => void }
mockLoaded.current = new Promise<void>((resolve) => {
  mockResolveLoad.current = resolve
})

jest.mock('@/shared/store/auth', () => {
  const { create } = jest.requireActual('zustand')
  const useAuthStore = create((set: (partial: Record<string, unknown>) => void) => ({
    token: null,
    user: null,
    setToken: (token: string) => set({ token }),
    setUser: (user: unknown) => set({ user }),
    clearAuth: () => set({ token: null, user: null }),
    loadFromStorage: async () => {
      await mockLoaded.current
      set({ token: 'restored-token' })
    },
  }))
  return { __esModule: true, useAuthStore }
})

function renderWithTheme() {
  return render(
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>,
  )
}

it('shows the splash and never the Login screen while the token is rehydrating', async () => {
  renderWithTheme()

  // The gate: before rehydration resolves, no auth screen may be on screen.
  expect(screen.queryByText('MAIN_TABS')).toBeNull()
  expect(screen.queryByText('Sign in')).toBeNull()
  expect(screen.getByTestId('splash')).toBeTruthy()

  mockResolveLoad.current()

  await waitFor(() => {
    expect(screen.getByText('MAIN_TABS')).toBeTruthy()
  })
})
