import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, fireEvent, waitFor, within } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context'
import PrivacySecurityScreen from '@/features/profile/screens/PrivacySecurityScreen'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { palette } from '@/theme/tokens'

// The privacy rows read and write the caller's OWN profile. Until STOURIFY-156
// they went through a module that called `/settings/account`, a route the
// server has never registered — and the test mocked that module, so the screen
// rendered the mock's fixture while every real request 404'd. A mock of a
// function that calls a URL nobody serves is a test of the mock.
jest.mock('@/shared/api/profiles', () => ({
  getMyProfile: jest.fn(),
  updateMyProfile: jest.fn(),
}))

jest.mock('@/shared/api/blocks', () => ({
  getBlocks: jest.fn(),
}))

jest.mock('@/shared/api/account', () => ({
  deleteAccount: jest.fn(),
  deletionOutcomeIsUnknown: jest.fn(() => false),
}))

jest.mock('@/sync/session', () => ({ signOut: jest.fn(() => Promise.resolve()) }))

import { getBlocks } from '@/shared/api/blocks'
import { getMyProfile, updateMyProfile } from '@/shared/api/profiles'
import { trackQueryClient } from '../support/queryClients'

const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

/**
 * A profile as `GET /profile` returns one, trimmed to what this screen reads.
 *
 * `shows_location_on_spots` defaults to `true` because that is the database
 * column's default and what the server sends for anybody who never touched it.
 */
const profile = (isPrivate: boolean, showsLocation = true) => ({
  uuid: 'profile-uuid-1',
  username: 'ziv',
  is_private: isPrivate,
  shows_location_on_spots: showsLocation,
})

const blocks = (total: number) => ({
  data: Array.from({ length: total }, (_, i) => ({ uuid: `block-${i}` })),
  links: {},
  meta: { current_page: 1, last_page: 1, total },
})

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() } as any

/** The client the most recent render used, so a test can read the cache back. */
let lastClient: QueryClient | null = null

async function renderScreen(scheme: 'light' | 'dark' = 'light') {
  const qc = trackQueryClient(
    new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  )
  lastClient = qc
  const utils = render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ThemeProvider scheme={scheme}>
        <QueryClientProvider client={qc}>
          <PrivacySecurityScreen navigation={mockNavigation} route={{} as any} />
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
  ;(getMyProfile as jest.Mock).mockResolvedValue(profile(false))
  ;(getBlocks as jest.Mock).mockResolvedValue(blocks(2))
  // Merged rather than rebuilt: a save carrying one field comes back with the
  // OTHER field untouched, which is exactly what the real endpoint does.
  ;(updateMyProfile as jest.Mock).mockImplementation((changes: Record<string, unknown>) =>
    Promise.resolve({ ...profile(false), ...changes }),
  )
})

describe('the Privacy & security screen (artboard 3)', () => {
  it('has the round back header, and Back returns to Settings', async () => {
    const { getByText, getByLabelText } = await renderScreen()

    expect(getByText('Privacy & security')).toBeTruthy()
    fireEvent.press(getByLabelText('Back'))
    expect(mockNavigation.goBack).toHaveBeenCalled()
  })

  it('draws no row for something the app cannot do yet', async () => {
    const { queryByText } = await renderScreen()

    await waitFor(() => expect(getMyProfile).toHaveBeenCalled())
    for (const row of ['Change password', 'Two-factor authentication', 'Download my data']) {
      expect(queryByText(row)).toBeNull()
    }
  })

  it('keeps its content in a scrollable container that clears the tab bar', async () => {
    const { getByTestId } = await renderScreen()

    const scroll = getByTestId('privacy-scroll')
    expect(within(scroll).getByText('Delete account')).toBeTruthy()
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle)?.paddingBottom).toBeGreaterThan(0)
  })

  it.each(['light', 'dark'] as const)('paints the page in the %s palette', async (scheme) => {
    const { getByTestId } = await renderScreen(scheme)

    const style = StyleSheet.flatten(getByTestId('privacy-screen').props.style)
    expect(style.backgroundColor).toBe(palette[scheme].surface)
  })
})

describe('Blocked accounts', () => {
  it('shows how many people you have blocked, and opens the list', async () => {
    const { getByText, findByText } = await renderScreen()

    expect(await findByText('2')).toBeTruthy()
    fireEvent.press(getByText('Blocked accounts'))
    expect(mockNavigation.navigate).toHaveBeenCalledWith('BlockedAccounts')
  })

  it('still opens the list when the count could not be loaded', async () => {
    ;(getBlocks as jest.Mock).mockRejectedValue(new Error('offline'))
    const { getByText } = await renderScreen()

    await waitFor(() => expect(getBlocks).toHaveBeenCalled())
    fireEvent.press(getByText('Blocked accounts'))
    expect(mockNavigation.navigate).toHaveBeenCalledWith('BlockedAccounts')
  })

  it('shares one cache entry with the Blocked accounts list', async () => {
    await renderScreen()

    await waitFor(() => expect(lastClient!.getQueryData(['blocks'])).toEqual(blocks(2)))
  })
})

describe('the Private account row', () => {
  /**
   * The switch shows what the SERVER stored, not a local guess. `is_private` is
   * the only privacy setting the backend enforces: it turns a follow into a
   * request that must be accepted, and hides the follower lists from strangers.
   */
  it('shows Off for a public account and On for a private one', async () => {
    const { getByLabelText, unmount } = await renderScreen()

    await waitFor(() => expect(getByLabelText('Private account').props.value).toBe(false))
    unmount()

    ;(getMyProfile as jest.Mock).mockResolvedValue(profile(true))
    const second = await renderScreen()
    await waitFor(() => expect(second.getByLabelText('Private account').props.value).toBe(true))
  })

  /**
   * One field and nothing else. `PATCH /profile` is an upsert that also
   * validates `username`, so restating untouched fields invites a uniqueness
   * failure on a save that had nothing to do with the handle.
   */
  it('saves through PATCH /profile carrying is_private and no other field', async () => {
    const { getByLabelText } = await renderScreen()

    await waitFor(() => expect(getMyProfile).toHaveBeenCalled())
    fireEvent(getByLabelText('Private account'), 'valueChange', true)

    await waitFor(() => expect(updateMyProfile).toHaveBeenCalledWith({ is_private: true }))
  })

  /**
   * The switch follows your finger rather than waiting for the round trip —
   * the one the STOURIFY-156 live run caught. The save is deliberately left
   * unresolved, so only the optimistic write can move the switch.
   */
  it('moves as soon as it is tapped, before the save comes back', async () => {
    let release: (value: unknown) => void = () => {}
    ;(updateMyProfile as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    const { getByLabelText } = await renderScreen()

    await waitFor(() => expect(getByLabelText('Private account').props.value).toBe(false))
    fireEvent(getByLabelText('Private account'), 'valueChange', true)

    await waitFor(() => expect(getByLabelText('Private account').props.value).toBe(true))
    release(profile(true))
  })

  /**
   * A privacy switch that silently keeps a value the server refused is the
   * worst failure this row has: you believe you are private and you are not.
   */
  it('puts the switch back and says so when the save is refused', async () => {
    ;(updateMyProfile as jest.Mock).mockRejectedValue(new Error('nope'))
    const { getByLabelText, getByText } = await renderScreen()

    await waitFor(() => expect(getByLabelText('Private account').props.value).toBe(false))
    fireEvent(getByLabelText('Private account'), 'valueChange', true)

    await waitFor(() => expect(getByText(/could not be saved/i)).toBeTruthy())
    expect(getByLabelText('Private account').props.value).toBe(false)
  })

  /**
   * Somebody who skipped onboarding has no profile row, so `PATCH /profile`
   * would demand a username they were never asked for. The row stays visible
   * and disabled: a privacy control present for some people and absent for
   * others cannot be found, explained in a support answer, or audited.
   */
  it('is disabled, not hidden, when the caller has no profile yet', async () => {
    ;(getMyProfile as jest.Mock).mockResolvedValue(null)
    const { getByLabelText, getByText } = await renderScreen()

    await waitFor(() => expect(getByLabelText('Private account').props.disabled).toBe(true))
    expect(getByText(/set up your profile/i)).toBeTruthy()

    fireEvent(getByLabelText('Private account'), 'valueChange', true)
    expect(updateMyProfile).not.toHaveBeenCalled()
  })

  /**
   * One cache entry, shared with the profile screen. Two keys for one fact is
   * how Settings and Profile end up disagreeing about whether you are private.
   */
  it('files the profile under the key the profile screen already uses', async () => {
    const { getByLabelText } = await renderScreen()

    await waitFor(() => expect(getByLabelText('Private account').props.value).toBe(false))
    expect(lastClient!.getQueryData(['explorer-profile', 'me'])).toEqual(profile(false))
  })

  it('no longer offers the two rows that were wired to a route nobody serves', async () => {
    const { queryByText } = await renderScreen()

    await waitFor(() => expect(getMyProfile).toHaveBeenCalled())
    expect(queryByText('Account Visibility')).toBeNull()
    expect(queryByText('Follow Mode')).toBeNull()
  })
})

describe('the Show location on spots row (STOURIFY-241)', () => {
  /**
   * Treats "nothing stored" as ON. An account that never opened this screen is
   * sharing its coordinates, so a switch reading Off would be a broken promise.
   */
  it('shows On by default and Off once the account has turned it off', async () => {
    const { getByLabelText, unmount } = await renderScreen()

    await waitFor(() => expect(getByLabelText('Show location on spots').props.value).toBe(true))
    unmount()

    ;(getMyProfile as jest.Mock).mockResolvedValue(profile(false, false))
    const second = await renderScreen()
    await waitFor(() =>
      expect(second.getByLabelText('Show location on spots').props.value).toBe(false),
    )
  })

  it('saves through PATCH /profile carrying shows_location_on_spots and no other field', async () => {
    const { getByLabelText } = await renderScreen()

    await waitFor(() => expect(getMyProfile).toHaveBeenCalled())
    fireEvent(getByLabelText('Show location on spots'), 'valueChange', false)

    await waitFor(() =>
      expect(updateMyProfile).toHaveBeenCalledWith({ shows_location_on_spots: false }),
    )
  })

  it('moves as soon as it is tapped, before the save comes back', async () => {
    let release: (value: unknown) => void = () => {}
    ;(updateMyProfile as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    const { getByLabelText } = await renderScreen()

    await waitFor(() => expect(getByLabelText('Show location on spots').props.value).toBe(true))
    fireEvent(getByLabelText('Show location on spots'), 'valueChange', false)

    await waitFor(() => expect(getByLabelText('Show location on spots').props.value).toBe(false))
    release(profile(false, false))
  })

  /**
   * The message names the location setting, because the two switches sit one
   * above the other and a shared sentence under both cannot say which failed.
   */
  it('puts the switch back and says which setting failed when the save is refused', async () => {
    ;(updateMyProfile as jest.Mock).mockRejectedValue(new Error('nope'))
    const { getByLabelText, getByText } = await renderScreen()

    await waitFor(() => expect(getByLabelText('Show location on spots').props.value).toBe(true))
    fireEvent(getByLabelText('Show location on spots'), 'valueChange', false)

    await waitFor(() => expect(getByText(/location setting is unchanged/i)).toBeTruthy())
    expect(getByLabelText('Show location on spots').props.value).toBe(true)
  })

  it('is disabled, not hidden, when the caller has no profile yet', async () => {
    ;(getMyProfile as jest.Mock).mockResolvedValue(null)
    const { getByLabelText } = await renderScreen()

    await waitFor(() => expect(getByLabelText('Show location on spots').props.disabled).toBe(true))

    fireEvent(getByLabelText('Show location on spots'), 'valueChange', false)
    expect(updateMyProfile).not.toHaveBeenCalled()
  })

  /**
   * The copy is part of the deliverable. Two things have to be said: turning it
   * off only works from now on, and it costs the spot its place in nearby.
   */
  it('says both of the things turning it off actually costs you', async () => {
    const { getByTestId } = await renderScreen()

    await waitFor(() => expect(getMyProfile).toHaveBeenCalled())
    const copy = getByTestId('location-privacy-copy').props.children as string

    expect(copy).toMatch(/from now on/i)
    expect(copy).toMatch(/nearby/i)
  })

  it('is the only control for this fact on the screen', async () => {
    const { getAllByLabelText } = await renderScreen()

    await waitFor(() => expect(getMyProfile).toHaveBeenCalled())
    expect(getAllByLabelText('Show location on spots')).toHaveLength(1)
  })
})
