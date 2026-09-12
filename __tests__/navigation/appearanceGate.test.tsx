import { render, screen, waitFor } from '@testing-library/react-native'
import RootNavigator from '@/shared/navigation/RootNavigator'
import { ThemeProvider } from '@/theme/ThemeProvider'

/**
 * STOURIFY-290: the first screen after the splash is already in the colours
 * you chose.
 *
 * The launch gate that holds the splash until the token and the onboarding
 * flag have been read also waits for the saved appearance. Without that, a
 * phone set to dark with the app set to Light would draw the first screen dark
 * and then flip — a flash on every launch.
 *
 * Every scheme the main screen is drawn in is recorded, so the test fails on a
 * single wrong frame and not only on the final one.
 */
const mockRendered: string[] = []

jest.mock('@/shared/navigation/TabNavigator', () => {
  const { Text } = require('react-native')
  const { useTheme } = require('@/theme/ThemeProvider')

  function MainTabs() {
    const { scheme } = useTheme()
    mockRendered.push(scheme)
    return <Text>{`MAIN_TABS:${scheme}`}</Text>
  }

  return { __esModule: true, default: MainTabs }
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

// A real zustand store in the appearance store's shape, whose read this test
// releases by hand. The phone reports no scheme under jest, which the theme
// reads as light — so a first frame drawn before the read would be light.
const mockLoaded = { current: null as unknown as Promise<void> }
const mockResolveLoad = { current: (() => {}) as () => void }
mockLoaded.current = new Promise<void>((resolve) => {
  mockResolveLoad.current = resolve
})

jest.mock('@/theme/appearance', () => {
  const { create } = jest.requireActual('zustand')
  const useAppearanceStore = create((set: (partial: Record<string, unknown>) => void) => ({
    choice: 'system',
    choose: async (choice: string) => set({ choice }),
    loadFromStorage: async () => {
      await mockLoaded.current
      set({ choice: 'dark' })
    },
  }))
  return { __esModule: true, useAppearanceStore }
})

it('holds the splash until the saved appearance is read, then draws the first screen in it', async () => {
  render(
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>,
  )

  expect(screen.getByTestId('splash')).toBeTruthy()
  expect(screen.queryByText(/MAIN_TABS/)).toBeNull()

  mockResolveLoad.current()

  await waitFor(() => expect(screen.getByText('MAIN_TABS:dark')).toBeTruthy())
  expect(mockRendered).not.toContain('light')
})
