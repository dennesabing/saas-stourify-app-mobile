import fs from 'fs'
import path from 'path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, fireEvent, waitFor, within } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context'
import SettingsScreen from '@/features/profile/screens/SettingsScreen'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { palette } from '@/theme/tokens'

jest.mock('@/shared/api/auth', () => ({
  logout: jest.fn(() => Promise.resolve()),
}))

jest.mock('@/shared/api/profiles', () => ({
  getMyProfile: jest.fn(),
  updateMyProfile: jest.fn(),
}))

// The seam the Log out tests guard: Settings MUST route through `signOut` — the
// ONE teardown path (database wipe, cursor reset, cache clear, navigate) — not
// through `useAuthStore.getState().clearAuth()` directly. A handler that called
// `clearAuth()` alone would never touch this mock.
jest.mock('@/sync/session', () => ({
  signOut: jest.fn(() => Promise.resolve()),
}))

// Android's night-mode switch, stood in for: the native module does not exist
// under jest, and what matters is what the app ASKS Android for.
jest.mock('react-native/Libraries/Utilities/Appearance', () => ({
  getColorScheme: jest.fn(() => null),
  setColorScheme: jest.fn(),
  addChangeListener: jest.fn(() => ({ remove: jest.fn() })),
}))

import { Appearance } from 'react-native'
import * as authApi from '@/shared/api/auth'
import { getMyProfile } from '@/shared/api/profiles'
import { useAuthStore } from '@/shared/store/auth'
import { signOut } from '@/sync/session'
import { useSyncStatusStore } from '@/sync/status'
import { useAppearanceStore } from '@/theme/appearance'
import { trackQueryClient } from '../support/queryClients'

/** A fixed frame, because `Sheet` reads the safe-area insets. */
const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

const city = {
  uuid: 'city-1',
  name: 'General Santos',
  region: null,
  country: null,
  is_featured: false,
}

/** A profile as `GET /profile` returns one, trimmed to what Settings reads. */
const profile = (overrides: Record<string, unknown> = {}) => ({
  uuid: 'profile-uuid-1',
  username: 'ziv',
  name: 'Ziv Luck',
  home_city: city,
  is_private: false,
  shows_location_on_spots: true,
  ...overrides,
})

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() } as any

async function renderSettings(scheme: 'light' | 'dark' = 'light') {
  // `gcTime: 0`, matching `__tests__/support/TestProviders.tsx`: React Query's
  // default collection timer otherwise outlives the test and jest never exits.
  const qc = trackQueryClient(
    new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  )
  const utils = render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ThemeProvider scheme={scheme}>
        <QueryClientProvider client={qc}>
          <SettingsScreen navigation={mockNavigation} route={{} as any} />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  )
  // Let the screen's first requests land inside act(): React Query hands
  // results to a screen on a timer, so a test that ended before then would get
  // a state update after it finished, which is what the act() warning reports.
  await waitFor(() => expect(qc.isFetching()).toBe(0))
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
  return utils
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getMyProfile as jest.Mock).mockResolvedValue(profile())
  useAuthStore.setState({ user: null })
  useAppearanceStore.setState({ choice: 'system' })
  useSyncStatusStore.setState({ pendingCount: 0, pendingMediaCount: 0 })
})

describe('the Settings hub (artboard 1)', () => {
  it('has the round back header, and Back leaves Settings', async () => {
    const { getByText, getByLabelText } = await renderSettings()

    expect(getByText('Settings')).toBeTruthy()
    fireEvent.press(getByLabelText('Back'))
    expect(mockNavigation.goBack).toHaveBeenCalled()
  })

  it('says who you are: your name, then @username · home city', async () => {
    const { findByText, getByText } = await renderSettings()

    expect(await findByText('Ziv Luck')).toBeTruthy()
    expect(getByText('@ziv · General Santos')).toBeTruthy()
  })

  it('leaves the city off when there is none, rather than a dangling dot', async () => {
    ;(getMyProfile as jest.Mock).mockResolvedValue(profile({ home_city: null }))
    const { findByText } = await renderSettings()

    expect(await findByText('@ziv')).toBeTruthy()
  })

  it('falls back to the account name for somebody with no profile yet', async () => {
    ;(getMyProfile as jest.Mock).mockResolvedValue(null)
    useAuthStore.setState({
      user: { id: '1', uuid: 'user-1', name: 'Ziv Luck', email: 'ziv@example.com' },
    })
    const { findByText, queryByText } = await renderSettings()

    expect(await findByText('Ziv Luck')).toBeTruthy()
    expect(queryByText(/^@/)).toBeNull()
  })

  it('offers the rows the app can back, in the design’s groups', async () => {
    const { getByText } = await renderSettings()

    for (const group of ['Account', 'Preferences', 'Offline', 'Legal']) {
      expect(getByText(group)).toBeTruthy()
    }
    for (const row of [
      'Edit profile',
      'Privacy & security',
      'Appearance',
      'Offline & sync',
      'Terms & privacy policy',
      'Log out',
    ]) {
      expect(getByText(row)).toBeTruthy()
    }
  })

  /**
   * The design draws these, and nothing in the app backs them yet — no push
   * notifications, one language, no subscriptions, no help articles or support
   * inbox, no 2FA. A row that leads nowhere is a false promise (STOURIFY-75), so
   * they are left out, and the card's spec names each one.
   */
  it('draws no row for something the app cannot do yet', async () => {
    const { queryByText } = await renderSettings()

    for (const row of [
      'Notifications',
      'Language',
      'Offline downloads',
      'Manage subscription',
      'Help center',
      'Contact support',
      'About Stourify',
      'Two-factor authentication',
    ]) {
      expect(queryByText(row)).toBeNull()
    }
  })

  it('moved the privacy controls and Delete account to Privacy & security', async () => {
    const { queryByLabelText, queryByText } = await renderSettings()

    expect(queryByLabelText('Private account')).toBeNull()
    expect(queryByLabelText('Show location on spots')).toBeNull()
    expect(queryByText('Delete account')).toBeNull()
  })

  it.each([
    ['Edit profile', 'EditProfile'],
    ['Privacy & security', 'PrivacySecurity'],
    ['Offline & sync', 'SyncStatus'],
  ])('%s opens %s', async (row, route) => {
    const { getByText } = await renderSettings()

    fireEvent.press(getByText(row))

    expect(mockNavigation.navigate).toHaveBeenCalledWith(route)
  })

  it('still carries the build line the client-identity check reads', async () => {
    const { getByTestId } = await renderSettings()

    expect(getByTestId('build-identity')).toBeTruthy()
  })
})

describe('Appearance: System, Light or Dark (STOURIFY-290)', () => {
  it('reads System on a fresh install', async () => {
    const { getByText } = await renderSettings()

    expect(getByText('System')).toBeTruthy()
  })

  it('opens a sheet with the three choices, the current one marked', async () => {
    const { getByText, getByLabelText } = await renderSettings()

    fireEvent.press(getByText('Appearance'))

    expect(getByLabelText('System').props.accessibilityState.selected).toBe(true)
    expect(getByLabelText('Light').props.accessibilityState.selected).toBe(false)
    expect(getByLabelText('Dark').props.accessibilityState.selected).toBe(false)
  })

  it('choosing Light applies it at once, closes the sheet and says so on the row', async () => {
    const { getByText, getByLabelText, queryByLabelText } = await renderSettings()

    fireEvent.press(getByText('Appearance'))
    fireEvent.press(getByLabelText('Light'))

    await waitFor(() => expect(useAppearanceStore.getState().choice).toBe('light'))
    expect(Appearance.setColorScheme).toHaveBeenCalledWith('light')
    await waitFor(() => expect(queryByLabelText('Dark')).toBeNull())
    expect(getByText('Light')).toBeTruthy()
  })

  it('choosing System hands the decision back to the phone', async () => {
    useAppearanceStore.setState({ choice: 'dark' })
    const { getByText, getByLabelText } = await renderSettings()

    fireEvent.press(getByText('Appearance'))
    fireEvent.press(getByLabelText('System'))

    await waitFor(() => expect(useAppearanceStore.getState().choice).toBe('system'))
    expect(Appearance.setColorScheme).toHaveBeenCalledWith(null)
  })
})

describe('Log out', () => {
  it('asks before it signs anybody out', async () => {
    const { getByText } = await renderSettings()

    fireEvent.press(getByText('Log out'))

    expect(getByText('Log out of Stourify?')).toBeTruthy()
    expect(authApi.logout).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('confirming calls authApi.logout, then routes teardown through signOut() alone', async () => {
    const { getByText, getByTestId } = await renderSettings()

    fireEvent.press(getByText('Log out'))
    fireEvent.press(getByTestId('logout-confirm'))

    await waitFor(() => {
      expect(authApi.logout).toHaveBeenCalled()
      expect(signOut).toHaveBeenCalledTimes(1)
    })
  })

  it('Stay logged in keeps you signed in', async () => {
    const { getByText, queryByText } = await renderSettings()

    fireEvent.press(getByText('Log out'))
    fireEvent.press(getByText('Stay logged in'))

    await waitFor(() => expect(queryByText('Log out of Stourify?')).toBeNull())
    expect(signOut).not.toHaveBeenCalled()
  })

  /**
   * The words have to be true (STOURIFY-214). Signing out wipes this phone's
   * copy, so changes that have not reached the server yet are gone for good.
   * The design's "Your offline downloads stay on this device" is the opposite
   * of what happens, so the sheet counts what would be lost instead.
   */
  it('says how many unsent changes logging out would delete', async () => {
    useSyncStatusStore.setState({ pendingCount: 2, pendingMediaCount: 1 })
    const { getByText, getByTestId } = await renderSettings()

    fireEvent.press(getByText('Log out'))

    const copy = getByTestId('logout-copy').props.children as string
    expect(copy).toMatch(/3 changes/)
    expect(copy).toMatch(/delete/i)
    expect(copy).toMatch(/drafts/i)
  })

  /**
   * Even with nothing queued, logging out is not free: drafts live only in this
   * phone's database, and `signOut()` wipes it. So the empty case says what is
   * safe (everything shared was sent) and still says what goes.
   */
  it('says so when nothing is waiting to be sent, and still mentions drafts', async () => {
    const { getByText, getByTestId } = await renderSettings()

    fireEvent.press(getByText('Log out'))

    const copy = getByTestId('logout-copy').props.children as string
    expect(copy).toMatch(/everything you’ve shared has been sent/i)
    expect(copy).toMatch(/drafts/i)
  })

  it('never promises that anything stays on the phone', async () => {
    useSyncStatusStore.setState({ pendingCount: 1, pendingMediaCount: 0 })
    const { getByText, queryByText } = await renderSettings()

    fireEvent.press(getByText('Log out'))

    expect(queryByText(/stay on this device/i)).toBeNull()
  })
})

/**
 * STOURIFY-181. Settings once hung everything off a plain `View`, which clips
 * rather than scrolls, so on a 720x1280 phone the last rows could not be
 * reached. These are proxies — a unit test has no viewport — for the structure
 * that makes scrolling possible. The emulator run is the real evidence.
 */
describe('the settings list can be scrolled (STOURIFY-181)', () => {
  it('keeps Log out inside a scrollable container', async () => {
    const { getByTestId } = await renderSettings()

    const scroll = within(getByTestId('settings-scroll'))
    expect(scroll.getByText('Log out')).toBeTruthy()
  })

  it('pads the bottom of the content, so the last row clears the tab bar', async () => {
    const { getByTestId } = await renderSettings()

    const style = StyleSheet.flatten(getByTestId('settings-scroll').props.contentContainerStyle)
    expect(style?.paddingBottom).toBeGreaterThan(0)
  })
})

/**
 * STOURIFY-169: Settings used to be the one screen that ignored the theme. It
 * wrote 17 colour literals and never asked the theme for anything, so it
 * stayed dark on a light phone.
 */
describe('colours come from the theme (STOURIFY-169)', () => {
  it.each(['light', 'dark'] as const)('paints the page in the %s palette', async (scheme) => {
    const { getByTestId } = await renderSettings(scheme)

    const style = StyleSheet.flatten(getByTestId('settings-screen').props.style)
    expect(style.backgroundColor).toBe(palette[scheme].surface)
  })

  it.each([
    'src/features/profile/screens/SettingsScreen.tsx',
    'src/features/profile/screens/PrivacySecurityScreen.tsx',
    'src/features/profile/components/SettingsRows.tsx',
  ])('%s writes no colour literal of its own', async (file) => {
    const source = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8')

    expect(source).not.toMatch(/['"]#[0-9a-f]{3,8}['"]/i)
    expect(source).not.toMatch(/rgba?\(/i)
  })
})
