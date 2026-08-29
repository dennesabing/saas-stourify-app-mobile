import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, fireEvent, waitFor, within } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import SettingsScreen from '@/features/profile/screens/SettingsScreen'

jest.mock('@/shared/api/auth', () => ({
  logout: jest.fn(() => Promise.resolve()),
}))

// The privacy row reads and writes the caller's OWN profile. Until
// STOURIFY-156 it went through a `@/shared/api/settings` module that called
// `/settings/account`, a route the server has never registered -- and this file
// mocked that module, so the screen faithfully rendered the mock's fixture
// while every real request 404'd. A mock of a function that calls a URL nobody
// serves is a test of the mock.
jest.mock('@/shared/api/profiles', () => ({
  getMyProfile: jest.fn(),
  updateMyProfile: jest.fn(),
}))

// The seam under test: SettingsScreen's Logout button MUST route through
// `signOut` — the ONE teardown path (database wipe, cursor reset, cache
// clear, navigate) — not through `useAuthStore.getState().clearAuth()`
// directly. A handler that calls `clearAuth()` alone would never touch this
// mock, so this test fails against that (pre-fix) implementation.
jest.mock('@/sync/session', () => ({
  signOut: jest.fn(() => Promise.resolve()),
}))

import * as authApi from '@/shared/api/auth'
import { getMyProfile, updateMyProfile } from '@/shared/api/profiles'
import { signOut } from '@/sync/session'
import { trackQueryClient } from '../support/queryClients'

/**
 * A profile as `GET /profile` returns one, trimmed to what this screen reads.
 *
 * `shows_location_on_spots` defaults to `true` here because that is what the
 * database column defaults to and what the server sends for anybody who has
 * never touched the setting -- so the fixture describes the ordinary account
 * rather than a configured one.
 */
const profile = (isPrivate: boolean, showsLocation = true) => ({
  uuid: 'profile-uuid-1',
  username: 'ziv',
  is_private: isPrivate,
  shows_location_on_spots: showsLocation,
})

const mockNavigation = { goBack: jest.fn() } as any

/** The client the most recent render used, so a test can read the cache back. */
let lastClient: QueryClient | null = null

function renderSettings() {
  // `gcTime: 0`, matching `__tests__/support/TestProviders.tsx`'s established
  // convention: React Query's default garbage-collection timer otherwise
  // leaves a handle open past the test, and jest never exits on its own.
  const qc = trackQueryClient(
    new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  )
  lastClient = qc
  return render(
    <QueryClientProvider client={qc}>
      <SettingsScreen navigation={mockNavigation} route={{} as any} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getMyProfile as jest.Mock).mockResolvedValue(profile(false))
  // Merged rather than rebuilt, because the screen now has two switches: a save
  // that carries one field must come back with the OTHER field untouched, which
  // is exactly what the real endpoint does.
  ;(updateMyProfile as jest.Mock).mockImplementation((changes: Record<string, unknown>) =>
    Promise.resolve({ ...profile(false), ...changes }),
  )
})

test('the Logout button calls authApi.logout then routes teardown through signOut()', async () => {
  const { getByText } = renderSettings()

  fireEvent.press(getByText('Logout'))

  await waitFor(() => {
    expect(authApi.logout).toHaveBeenCalled()
    expect(signOut).toHaveBeenCalled()
  })
})

test('the Logout button does not call clearAuth directly — signOut is the only teardown', async () => {
  const { getByText } = renderSettings()

  fireEvent.press(getByText('Logout'))

  await waitFor(() => {
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})

describe('the Private account row', () => {
  /**
   * The switch shows what the SERVER stored, not a local guess. `is_private` is
   * the only privacy setting the backend actually enforces: it turns a follow
   * into a request that must be accepted, and it refuses the follower and
   * following lists to strangers.
   */
  it('shows Off for a public account and On for a private one', async () => {
    const { getByLabelText, unmount } = renderSettings()

    await waitFor(() => expect(getByLabelText('Private account').props.value).toBe(false))
    unmount()

    ;(getMyProfile as jest.Mock).mockResolvedValue(profile(true))
    const second = renderSettings()
    await waitFor(() => expect(second.getByLabelText('Private account').props.value).toBe(true))
  })

  /**
   * One field and nothing else. `PATCH /profile` is an upsert that also
   * validates `username`, so restating fields the user never touched invites a
   * uniqueness failure on a save that had nothing to do with the handle.
   */
  it('saves through PATCH /profile carrying is_private and no other field', async () => {
    const { getByLabelText } = renderSettings()

    await waitFor(() => expect(getMyProfile).toHaveBeenCalled())
    fireEvent(getByLabelText('Private account'), 'valueChange', true)

    await waitFor(() => expect(updateMyProfile).toHaveBeenCalledWith({ is_private: true }))
  })

  /**
   * The switch follows your finger rather than waiting for the round trip.
   *
   * This is the one the live run caught and the earlier tests missed. The save
   * landed correctly in the database while the switch sat in its old position
   * for several seconds, which reads as "it ignored my tap" — and on a switch,
   * the natural response to that is to tap again, which would set it straight
   * back. The save is deliberately left unresolved here, so the only thing that
   * can move the switch is the optimistic write.
   */
  it('moves as soon as it is tapped, before the save comes back', async () => {
    let release: (value: unknown) => void = () => {}
    ;(updateMyProfile as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    const { getByLabelText } = renderSettings()

    await waitFor(() => expect(getByLabelText('Private account').props.value).toBe(false))
    fireEvent(getByLabelText('Private account'), 'valueChange', true)

    await waitFor(() => expect(getByLabelText('Private account').props.value).toBe(true))
    release(profile(true))
  })

  /**
   * A privacy switch that silently keeps a value the server refused is the worst
   * failure this row has: the user believes they are private and they are not.
   * The rows this replaces had no error handler at all, which is a large part of
   * why nobody noticed the 404s for months.
   */
  it('puts the switch back and says so when the save is refused', async () => {
    ;(updateMyProfile as jest.Mock).mockRejectedValue(new Error('nope'))
    const { getByLabelText, getByText } = renderSettings()

    await waitFor(() => expect(getByLabelText('Private account').props.value).toBe(false))
    fireEvent(getByLabelText('Private account'), 'valueChange', true)

    await waitFor(() => expect(getByText(/could not be saved/i)).toBeTruthy())
    expect(getByLabelText('Private account').props.value).toBe(false)
  })

  /**
   * Somebody who registered and skipped onboarding has no profile row, so
   * `GET /profile` resolves to null and `PATCH /profile` would demand a username
   * they were never asked for. The row stays visible and disabled rather than
   * disappearing: a privacy control that is present for some people and absent
   * for others cannot be found, explained in a support answer, or audited.
   */
  it('is disabled, not hidden, when the caller has no profile yet', async () => {
    ;(getMyProfile as jest.Mock).mockResolvedValue(null)
    const { getByLabelText, getByText } = renderSettings()

    await waitFor(() => expect(getByLabelText('Private account').props.disabled).toBe(true))
    expect(getByText(/set up your profile/i)).toBeTruthy()

    fireEvent(getByLabelText('Private account'), 'valueChange', true)
    expect(updateMyProfile).not.toHaveBeenCalled()
  })

  /**
   * One cache entry, shared with the profile screen, which files the caller's
   * own profile under this same key. Two keys for one fact is how Settings and
   * Profile end up disagreeing about whether you are private.
   */
  it('files the profile under the key the profile screen already uses', async () => {
    const { getByLabelText } = renderSettings()

    await waitFor(() => expect(getByLabelText('Private account').props.value).toBe(false))
    expect(lastClient!.getQueryData(['explorer-profile', 'me'])).toEqual(profile(false))
  })

  it('no longer offers the two rows that were wired to a route nobody serves', async () => {
    const { queryByText } = renderSettings()

    await waitFor(() => expect(getMyProfile).toHaveBeenCalled())
    expect(queryByText('Account Visibility')).toBeNull()
    expect(queryByText('Follow Mode')).toBeNull()
  })
  /**
   * STOURIFY-181. Settings used to hang everything off a plain `View`, which
   * clips rather than scrolls, so on a 720x1280 phone the list stopped at Terms
   * of Service and Logout and Delete account could not be reached by any
   * gesture.
   *
   * These three cases are honest about what they are: PROXIES. A unit test
   * renders into no viewport at all, so it finds every row whether or not a real
   * screen could show them -- which is exactly why this bug shipped past a suite
   * that already asserted both rows exist. What they pin is the STRUCTURE that
   * makes scrolling possible, and they fail against the pre-fix file. The
   * evidence that the bug is gone is the emulator run on the short device.
   */
  describe('the settings list can be scrolled (STOURIFY-181)', () => {
    it('puts its content in a scrollable container', async () => {
      const { getByTestId } = renderSettings()

      await waitFor(() => expect(getMyProfile).toHaveBeenCalled())
      expect(getByTestId('settings-scroll')).toBeTruthy()
    })

    it('keeps Logout and Delete account inside that container, not outside it', async () => {
      const { getByTestId } = renderSettings()

      await waitFor(() => expect(getMyProfile).toHaveBeenCalled())
      const scroll = within(getByTestId('settings-scroll'))
      expect(scroll.getByText('Logout')).toBeTruthy()
      expect(scroll.getByText('Delete account')).toBeTruthy()
    })

    it('pads the bottom of the content, so the last row clears the tab bar', async () => {
      const { getByTestId } = renderSettings()

      await waitFor(() => expect(getMyProfile).toHaveBeenCalled())
      const style = StyleSheet.flatten(getByTestId('settings-scroll').props.contentContainerStyle)
      expect(style?.paddingBottom).toBeGreaterThan(0)
    })
  })
})

describe('the Show location on spots row (STOURIFY-241)', () => {
  /**
   * Reads what the server stored, and treats "nothing stored" as ON.
   *
   * The default matters more than it looks. The column defaults to `true`, and
   * an account that has never opened this screen gets that value -- so a switch
   * that showed Off while the server was still handing out coordinates would be
   * the same broken promise this whole feature exists to remove, told backwards.
   */
  it('shows On by default and Off once the account has turned it off', async () => {
    const { getByLabelText, unmount } = renderSettings()

    await waitFor(() => expect(getByLabelText('Show location on spots').props.value).toBe(true))
    unmount()

    ;(getMyProfile as jest.Mock).mockResolvedValue(profile(false, false))
    const second = renderSettings()
    await waitFor(() =>
      expect(second.getByLabelText('Show location on spots').props.value).toBe(false),
    )
  })

  /**
   * One field and nothing else, for the same reason the Private account row
   * sends one: `PATCH /profile` is an upsert that also validates `username`, so
   * restating fields nobody touched lets an unrelated uniqueness failure block a
   * save about location.
   */
  it('saves through PATCH /profile carrying shows_location_on_spots and no other field', async () => {
    const { getByLabelText } = renderSettings()

    await waitFor(() => expect(getMyProfile).toHaveBeenCalled())
    fireEvent(getByLabelText('Show location on spots'), 'valueChange', false)

    await waitFor(() =>
      expect(updateMyProfile).toHaveBeenCalledWith({ shows_location_on_spots: false }),
    )
  })

  /** Follows your finger, like the row above it. Same reasoning, same pattern. */
  it('moves as soon as it is tapped, before the save comes back', async () => {
    let release: (value: unknown) => void = () => {}
    ;(updateMyProfile as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    const { getByLabelText } = renderSettings()

    await waitFor(() => expect(getByLabelText('Show location on spots').props.value).toBe(true))
    fireEvent(getByLabelText('Show location on spots'), 'valueChange', false)

    await waitFor(() => expect(getByLabelText('Show location on spots').props.value).toBe(false))
    release(profile(false, false))
  })

  /**
   * A switch that keeps a value the server refused tells somebody their location
   * is hidden when it is not -- the single worst outcome this row has.
   *
   * The message names the location setting rather than the account, because the
   * two switches sit one above the other and a shared sentence under both of
   * them cannot say which save failed.
   */
  it('puts the switch back and says which setting failed when the save is refused', async () => {
    ;(updateMyProfile as jest.Mock).mockRejectedValue(new Error('nope'))
    const { getByLabelText, getByText } = renderSettings()

    await waitFor(() => expect(getByLabelText('Show location on spots').props.value).toBe(true))
    fireEvent(getByLabelText('Show location on spots'), 'valueChange', false)

    await waitFor(() => expect(getByText(/location setting is unchanged/i)).toBeTruthy())
    expect(getByLabelText('Show location on spots').props.value).toBe(true)
  })

  /** Disabled rather than hidden, exactly like the Private account row. */
  it('is disabled, not hidden, when the caller has no profile yet', async () => {
    ;(getMyProfile as jest.Mock).mockResolvedValue(null)
    const { getByLabelText } = renderSettings()

    await waitFor(() => expect(getByLabelText('Show location on spots').props.disabled).toBe(true))

    fireEvent(getByLabelText('Show location on spots'), 'valueChange', false)
    expect(updateMyProfile).not.toHaveBeenCalled()
  })

  /**
   * The copy is part of the deliverable, not decoration, so it is pinned like
   * any other behaviour. Two things have to be said and both are easy to drop in
   * a later tidy-up: that turning it off only works from now on, and that it
   * costs the spot its place in nearby results.
   */
  it('says both of the things turning it off actually costs you', async () => {
    const { getByTestId } = renderSettings()

    await waitFor(() => expect(getMyProfile).toHaveBeenCalled())
    const copy = getByTestId('location-privacy-copy').props.children as string

    expect(copy).toMatch(/from now on/i)
    expect(copy).toMatch(/nearby/i)
  })

  /**
   * One control for one fact. A second switch somewhere else would be two
   * answers to the same question, and whichever one somebody found last would
   * be the one they believed.
   */
  it('is the only control for this fact on the screen', async () => {
    const { getAllByLabelText } = renderSettings()

    await waitFor(() => expect(getMyProfile).toHaveBeenCalled())
    expect(getAllByLabelText('Show location on spots')).toHaveLength(1)
  })
})
