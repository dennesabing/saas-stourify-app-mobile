import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context'
import ProfileScreen from '@/features/profile/screens/ProfileScreen'
import { ThemeProvider } from '@/theme/ThemeProvider'
import type { ExplorerProfile } from '@/shared/api/profiles'

/**
 * The identity surface (STOURIFY-35).
 *
 * The seam these tests hold is which ENDPOINT the screen reads. Until this
 * card the screen called `GET /users/{uuid}` — the boilerplate's platform-user
 * route — which carries no username, no bio and no counts, so the header was
 * structurally incapable of rendering an explorer identity and the counts were
 * hardcoded to a literal "–". Asserting on `getMyProfile`/`getProfile` is
 * therefore not mock-shaped busywork: an implementation that reads the wrong
 * endpoint fails here and passes nothing.
 */

jest.mock('@/shared/api/profiles', () => ({
  getMyProfile: jest.fn(),
  getProfile: jest.fn(),
}))

jest.mock('@/shared/api/posts', () => ({
  getPosts: jest.fn(),
  getUserPosts: jest.fn(),
}))

jest.mock('@/shared/api/follows', () => ({
  follow: jest.fn(),
  unfollow: jest.fn(),
}))

jest.mock('@/shared/api/blocks', () => ({
  blockUser: jest.fn(),
}))

jest.mock('@/shared/api/reports', () => {
  const actual = jest.requireActual('@/shared/api/reports')
  return { ...actual, fileReport: jest.fn() }
})

import { getMyProfile, getProfile } from '@/shared/api/profiles'
import { getPosts, getUserPosts } from '@/shared/api/posts'
import { follow, unfollow } from '@/shared/api/follows'
import { blockUser } from '@/shared/api/blocks'
import { fileReport } from '@/shared/api/reports'
import { useAuthStore } from '@/shared/store/auth'
import { trackQueryClient } from '../support/queryClients'

const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

const ME_UUID = 'user-me'
const OTHER_UUID = 'user-other'

function profileFixture(over: Partial<ExplorerProfile> = {}): ExplorerProfile {
  return {
    uuid: 'profile-1',
    user_uuid: OTHER_UUID,
    name: 'Grace Santos',
    username: 'santos_grace',
    bio: 'Chasing coastlines.',
    website: null,
    interests: ['Food', 'Nature'],
    home_city: { uuid: 'c1', name: 'General Santos', region: 'SOCCSKSARGEN', country: 'PH', is_featured: true },
    is_private: false,
    counts: { spots: 3, followers: 12, following: 7 },
    viewer: { is_self: false, is_following: false, follow_status: null, follow_uuid: null },
    created_at: null,
    can: {},
    ...over,
  }
}

function emptyPage() {
  return { data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } }
}

/**
 * `getState().routeNames` is what the screen uses to decide whether it may
 * navigate to EditProfile/Settings/FollowList: it is registered on four stacks
 * and only the Profile stack carries those. The default here is the Profile
 * stack; `renderProfile` takes an override for the others.
 */
const PROFILE_STACK_ROUTES = ['Profile', 'FollowList', 'EditProfile', 'Settings', 'PostDetail']

let routeNames = PROFILE_STACK_ROUTES

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  getState: () => ({ routeNames }),
} as any

/**
 * The query client the last `renderProfile` built, with `resetQueries` spied.
 *
 * A block changes what several endpoints return — feed, profile, posts, search —
 * so dropping those caches is the only thing that makes the blocked explorer's
 * content leave the screen without a restart. It is `resetQueries` and not
 * `invalidateQueries` deliberately: the live run showed invalidation issuing the
 * refetches and still leaving the blocked explorer's post on screen, because
 * invalidation keeps the stale pages rendered until every refetch it started
 * resolves. This assertion pins the stronger call so the weaker one cannot come
 * back as a "tidy-up".
 */
let resetSpy: jest.SpyInstance

function renderProfile(userId?: string, queryClient?: QueryClient) {
  const qc = queryClient ?? trackQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }))
  resetSpy = jest.spyOn(qc, 'resetQueries')
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ThemeProvider scheme="light">
        <QueryClientProvider client={qc}>
          <ProfileScreen navigation={navigation} route={{ params: userId ? { userId } : undefined } as any} />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  routeNames = PROFILE_STACK_ROUTES
  useAuthStore.setState({
    user: { id: '1', uuid: ME_UUID, name: 'Ramil Santos', email: 'me@dev.local' },
  } as any)
  ;(getPosts as jest.Mock).mockResolvedValue(emptyPage())
  ;(getUserPosts as jest.Mock).mockResolvedValue(emptyPage())
})

// ---------------------------------------------------------------------------
// Mine
// ---------------------------------------------------------------------------

test('the own profile reads GET /profile, never the other-user route', async () => {
  ;(getMyProfile as jest.Mock).mockResolvedValue(
    profileFixture({ user_uuid: ME_UUID, username: 'santos_ramil', viewer: { is_self: true, is_following: false, follow_status: null, follow_uuid: null } }),
  )

  renderProfile()

  await waitFor(() => expect(getMyProfile).toHaveBeenCalled())
  expect(getProfile).not.toHaveBeenCalled()
  expect(await screen.findByText('@santos_ramil')).toBeTruthy()
})

test('the own profile grid lists only my posts', async () => {
  ;(getMyProfile as jest.Mock).mockResolvedValue(profileFixture({ user_uuid: ME_UUID, viewer: { is_self: true, is_following: false, follow_status: null, follow_uuid: null } }))

  renderProfile()

  // `mine` is what makes this a profile grid rather than the whole visible
  // corpus — a bare GET /posts renders every author's work under my name.
  await waitFor(() => expect(getPosts).toHaveBeenCalledWith({ mine: true }))
})

test('the header renders the real counts, not a placeholder dash', async () => {
  ;(getMyProfile as jest.Mock).mockResolvedValue(
    profileFixture({ user_uuid: ME_UUID, counts: { spots: 3, followers: 12, following: 7 }, viewer: { is_self: true, is_following: false, follow_status: null, follow_uuid: null } }),
  )

  renderProfile()

  expect(await screen.findByText('12')).toBeTruthy()
  expect(screen.getByText('7')).toBeTruthy()
  expect(screen.queryByText('–')).toBeNull()
})

test('an explorer who has not finished onboarding is told so, not shown a blank header', async () => {
  ;(getMyProfile as jest.Mock).mockResolvedValue(null)

  renderProfile()

  expect(await screen.findByText(/no profile yet/i)).toBeTruthy()
})

test('my own profile offers Edit and Settings, never a Follow button', async () => {
  ;(getMyProfile as jest.Mock).mockResolvedValue(profileFixture({ user_uuid: ME_UUID, viewer: { is_self: true, is_following: false, follow_status: null, follow_uuid: null } }))

  renderProfile()

  expect(await screen.findByText('Edit Profile')).toBeTruthy()
  expect(screen.getByText('Settings')).toBeTruthy()
  expect(screen.queryByText('Follow')).toBeNull()
})

test('my own profile inside the feed stack hides actions that stack cannot reach', async () => {
  // Tapping my own post in the feed opens MY profile on the Home stack, which
  // registers no EditProfile or Settings. Offering the buttons there navigates
  // to a route that does not exist and throws.
  routeNames = ['Home', 'PostDetail', 'Profile', 'Comments']
  ;(getMyProfile as jest.Mock).mockResolvedValue(profileFixture({ user_uuid: ME_UUID, viewer: { is_self: true, is_following: false, follow_status: null, follow_uuid: null } }))

  renderProfile(ME_UUID)

  await waitFor(() => expect(getMyProfile).toHaveBeenCalled())
  expect(screen.queryByText('Edit Profile')).toBeNull()
  expect(screen.queryByText('Settings')).toBeNull()
})

// ---------------------------------------------------------------------------
// Somebody else's
// ---------------------------------------------------------------------------

test('another explorer reads GET /profiles/{user} and lists their posts', async () => {
  ;(getProfile as jest.Mock).mockResolvedValue(profileFixture())

  renderProfile(OTHER_UUID)

  await waitFor(() => expect(getProfile).toHaveBeenCalledWith(OTHER_UUID))
  expect(getMyProfile).not.toHaveBeenCalled()
  expect(getUserPosts).toHaveBeenCalledWith(OTHER_UUID)
  expect(await screen.findByText('@santos_grace')).toBeTruthy()
  expect(screen.getByText('Chasing coastlines.')).toBeTruthy()
})

test('the header shows the display name above the handle, never the handle twice', async () => {
  // The live run caught this: the server sent no `name`, so the header fell
  // back to the username and rendered "santos_grace" over "@santos_grace".
  ;(getProfile as jest.Mock).mockResolvedValue(profileFixture())

  renderProfile(OTHER_UUID)

  expect(await screen.findByText('Grace Santos')).toBeTruthy()
  expect(screen.queryByText('santos_grace')).toBeNull()
})

test('the Follow button reflects the server-side relationship rather than defaulting to Follow', async () => {
  ;(getProfile as jest.Mock).mockResolvedValue(
    profileFixture({ viewer: { is_self: false, is_following: true, follow_status: 'active', follow_uuid: 'edge-1' } }),
  )

  renderProfile(OTHER_UUID)

  // Queried by the ACTION label: "Following" as visible text also matches the
  // Following count stat, and the two are different things.
  expect(await screen.findByLabelText('Unfollow')).toBeTruthy()
  expect(screen.queryByLabelText('Follow')).toBeNull()
})

test('a pending request to a private account renders Requested, not Following', async () => {
  ;(getProfile as jest.Mock).mockResolvedValue(
    profileFixture({ is_private: true, viewer: { is_self: false, is_following: false, follow_status: 'pending', follow_uuid: 'edge-2' } }),
  )

  renderProfile(OTHER_UUID)

  expect(await screen.findByText('Requested')).toBeTruthy()
  expect(screen.queryByLabelText('Follow')).toBeNull()
})

test('unfollowing addresses the edge uuid the viewer block carries', async () => {
  ;(getProfile as jest.Mock).mockResolvedValue(
    profileFixture({ viewer: { is_self: false, is_following: true, follow_status: 'active', follow_uuid: 'edge-1' } }),
  )
  ;(unfollow as jest.Mock).mockResolvedValue(undefined)

  renderProfile(OTHER_UUID)

  fireEvent.press(await screen.findByLabelText('Unfollow'))

  // The user uuid would 404 — DELETE /follows takes the EDGE's uuid.
  await waitFor(() => expect(unfollow).toHaveBeenCalledWith('edge-1'))
})

test('cancelling a pending request deletes the same edge', async () => {
  ;(getProfile as jest.Mock).mockResolvedValue(
    profileFixture({ is_private: true, viewer: { is_self: false, is_following: false, follow_status: 'pending', follow_uuid: 'edge-2' } }),
  )
  ;(unfollow as jest.Mock).mockResolvedValue(undefined)

  renderProfile(OTHER_UUID)

  fireEvent.press(await screen.findByLabelText('Cancel follow request'))

  // Not a second `follow()` — the request already exists.
  await waitFor(() => expect(unfollow).toHaveBeenCalledWith('edge-2'))
  expect(follow).not.toHaveBeenCalled()
})

test('following an explorer sends their user uuid', async () => {
  ;(getProfile as jest.Mock).mockResolvedValue(profileFixture())
  ;(follow as jest.Mock).mockResolvedValue({ uuid: 'edge-3', status: 'active' })

  renderProfile(OTHER_UUID)

  fireEvent.press(await screen.findByLabelText('Follow'))

  await waitFor(() => expect(follow).toHaveBeenCalledWith(OTHER_UUID))
})

test('a blocked pair sees a neutral unavailable message, not a blank screen', async () => {
  // The server answers 403 identically whichever side of the block the caller
  // is on (STOURIFY-36), so the client must not try to explain it either.
  ;(getProfile as jest.Mock).mockRejectedValue({
    response: { status: 403, data: { message: 'This profile is not available.' } },
  })

  renderProfile(OTHER_UUID)

  expect(await screen.findByText(/not available/i)).toBeTruthy()
})

test('an explorer with no profile row reads as not found, not as a crash', async () => {
  ;(getProfile as jest.Mock).mockRejectedValue({ response: { status: 404 } })

  renderProfile(OTHER_UUID)

  expect(await screen.findByText(/no profile/i)).toBeTruthy()
})

/**
 * The wording that started STOURIFY-82. A newly registered user tapped their
 * own Profile tab and was told "This explorer has not set up their profile
 * yet" — somebody else's sentence, about them — with *Go back* as the only
 * control. Third-person copy on your own screen is not a style slip; it tells
 * the reader they are looking at the wrong thing.
 */
test('my own profile failing to load does not describe me in the third person', async () => {
  ;(getMyProfile as jest.Mock).mockRejectedValue({ response: { status: 500 } })

  renderProfile()

  expect(await screen.findByText(/could not load your profile/i)).toBeTruthy()
  expect(screen.queryByText(/this explorer/i)).toBeNull()
})

test('my own profile failing to load offers a retry rather than only Go back', async () => {
  ;(getMyProfile as jest.Mock).mockRejectedValue({ response: { status: 500 } })

  renderProfile()

  const retry = await screen.findByText('Try again')
  ;(getMyProfile as jest.Mock).mockResolvedValue(profileFixture({ user_uuid: ME_UUID }))

  fireEvent.press(retry)

  await waitFor(() => expect(getMyProfile).toHaveBeenCalledTimes(2))
})

// ---------------------------------------------------------------------------
// The posts grid, which is a SECOND query with its own outcomes (STOURIFY-87)
// ---------------------------------------------------------------------------

/**
 * One screen, two requests, and until STOURIFY-87 only one of them told the
 * truth about failing.
 *
 * The profile query above got an honest failure state with a retry in
 * STOURIFY-82. The posts query eleven lines below still said "You have not
 * posted yet." to somebody whose posts request had just timed out — a claim
 * about their posting history that nobody had checked.
 *
 * Every case here lets the PROFILE query succeed, so the two failures cannot be
 * confused: the header renders normally and only the grid area reports trouble.
 * That separation is the point — two whole-screen failure messages about one
 * profile would read as two faults.
 */
describe('a failed posts fetch is not an empty posts grid', () => {
  function postFixture(over: Record<string, unknown> = {}) {
    return { uuid: 'post-1', caption: 'Sunset at Gumasa', media: [], ...over }
  }

  function postsPage(rows: unknown[]) {
    return { data: rows, links: {}, meta: { current_page: 1, last_page: 1, total: rows.length } }
  }

  beforeEach(() => {
    ;(getMyProfile as jest.Mock).mockResolvedValue(
      profileFixture({
        user_uuid: ME_UUID,
        viewer: { is_self: true, is_following: false, follow_status: null, follow_uuid: null },
      }),
    )
    ;(getProfile as jest.Mock).mockResolvedValue(profileFixture())
  })

  test('says the posts failed, and offers a retry that re-runs that query', async () => {
    ;(getPosts as jest.Mock).mockRejectedValue(new Error('timeout of 15000ms exceeded'))

    renderProfile()

    expect(await screen.findByText("Couldn't load the posts")).toBeTruthy()
    expect(screen.queryByText('You have not posted yet.')).toBeNull()
    // The header loaded fine, so the screen must not also claim the profile failed.
    expect(screen.queryByText(/could not load your profile/i)).toBeNull()
    expect(screen.getByText('@santos_grace')).toBeTruthy()

    expect(getPosts).toHaveBeenCalledTimes(1)

    fireEvent.press(screen.getByText('Try again'))

    await waitFor(() => expect(getPosts).toHaveBeenCalledTimes(2))
    // The retry belongs to the posts query alone.
    expect(getMyProfile).toHaveBeenCalledTimes(1)
  })

  test("says the posts failed on somebody else's profile too", async () => {
    ;(getUserPosts as jest.Mock).mockRejectedValue(new Error('offline'))

    renderProfile(OTHER_UUID)

    expect(await screen.findByText("Couldn't load the posts")).toBeTruthy()
    expect(screen.queryByText('No posts to show.')).toBeNull()
  })

  test('still says you have not posted yet when the request succeeds with no posts', async () => {
    ;(getPosts as jest.Mock).mockResolvedValue(emptyPage())

    renderProfile()

    expect(await screen.findByText('You have not posted yet.')).toBeTruthy()
    expect(screen.queryByText("Couldn't load the posts")).toBeNull()
    expect(screen.queryByText('Try again')).toBeNull()
  })

  test('claims neither while the posts request is still in flight', async () => {
    // Never settles, so the grid stays in its first-load state.
    ;(getPosts as jest.Mock).mockReturnValue(new Promise(() => {}))

    renderProfile()

    // This grid's loading treatment is deliberately nothing at all — so the
    // assertion is that the screen rendered and yet made no claim either way.
    expect(await screen.findByText('@santos_grace')).toBeTruthy()
    expect(screen.queryByText('You have not posted yet.')).toBeNull()
    expect(screen.queryByText("Couldn't load the posts")).toBeNull()
    expect(screen.queryByText('Try again')).toBeNull()
  })

  /**
   * The error branch lives inside `ListEmptyComponent`, which never renders
   * while the grid holds rows — so posts the reader could already see must
   * survive a failing refetch rather than being covered by a message.
   */
  test('keeps showing posts already on screen when a later fetch fails', async () => {
    ;(getPosts as jest.Mock).mockRejectedValue(new Error('offline'))

    const seeded = trackQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }))
    seeded.setQueryData(['explorer-posts', 'me'], postsPage([postFixture()]))

    renderProfile(undefined, seeded)

    await waitFor(() => expect(getPosts).toHaveBeenCalled())

    // The header settles after the posts request is issued — wait for it, or
    // the assertions below read a screen still showing the profile skeletons.
    expect(await screen.findByLabelText('Post: Sunset at Gumasa')).toBeTruthy()
    expect(screen.queryByText("Couldn't load the posts")).toBeNull()
    expect(screen.queryByText('You have not posted yet.')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Block and report (STOURIFY-37)
// ---------------------------------------------------------------------------

/**
 * These are the safety affordances the store requires, and the seam they hold
 * is the confirmation. Blocking is not undoable in full: the server deletes the
 * follow edges in both directions and `BlockApiController::destroy()` states
 * that unblocking does not put them back. So a one-tap block in the overflow
 * menu would be a permanent side effect behind an accidental brush of a finger.
 *
 * They are also gated on the profile not being my own, rather than on
 * `profile.can`. That map is `view`/`update`/`delete` on the ExplorerProfile
 * row, so `can.update` is true only for the owner — gating Block on it would
 * show the button on exactly the one profile where blocking is meaningless.
 */

test('another explorer offers block and report; my own profile does not', async () => {
  ;(getProfile as jest.Mock).mockResolvedValue(profileFixture())

  renderProfile(OTHER_UUID)

  fireEvent.press(await screen.findByLabelText('More options'))
  expect(screen.getByText('Block')).toBeTruthy()
  expect(screen.getByText('Report')).toBeTruthy()
})

test('my own profile has no overflow menu at all', async () => {
  ;(getMyProfile as jest.Mock).mockResolvedValue(
    profileFixture({
      user_uuid: ME_UUID,
      viewer: { is_self: true, is_following: false, follow_status: null, follow_uuid: null },
    }),
  )

  renderProfile()

  await waitFor(() => expect(getMyProfile).toHaveBeenCalled())
  expect(screen.queryByLabelText('More options')).toBeNull()
})

test('choosing Block asks first and files nothing until it is confirmed', async () => {
  ;(getProfile as jest.Mock).mockResolvedValue(profileFixture())

  renderProfile(OTHER_UUID)

  fireEvent.press(await screen.findByLabelText('More options'))
  fireEvent.press(screen.getByText('Block'))

  // The menu tap opens the confirmation. It must not have blocked yet.
  expect(blockUser).not.toHaveBeenCalled()
  expect(screen.getByText(/Block Grace Santos\?/i)).toBeTruthy()
  // The consequence is named, because it is the part that cannot be undone.
  expect(screen.getByText(/will not be restored/i)).toBeTruthy()
})

test('dismissing the confirmation blocks nobody', async () => {
  ;(getProfile as jest.Mock).mockResolvedValue(profileFixture())

  renderProfile(OTHER_UUID)

  fireEvent.press(await screen.findByLabelText('More options'))
  fireEvent.press(screen.getByText('Block'))
  fireEvent.press(screen.getByLabelText('Cancel'))

  expect(blockUser).not.toHaveBeenCalled()
})

test('confirming blocks by user uuid and leaves the screen', async () => {
  ;(getProfile as jest.Mock).mockResolvedValue(profileFixture())
  ;(blockUser as jest.Mock).mockResolvedValue({ uuid: 'block-1', created_at: null })

  renderProfile(OTHER_UUID)

  fireEvent.press(await screen.findByLabelText('More options'))
  fireEvent.press(screen.getByText('Block'))
  fireEvent.press(screen.getByLabelText('Block this explorer'))

  await waitFor(() => expect(blockUser).toHaveBeenCalledWith(OTHER_UUID))
  // Staying put would leave a screen whose very next read is a 403.
  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled())
})

test('a block drops the caches that would otherwise keep showing the blocked explorer', async () => {
  ;(getProfile as jest.Mock).mockResolvedValue(profileFixture())
  ;(blockUser as jest.Mock).mockResolvedValue({ uuid: 'block-1', created_at: null })

  renderProfile(OTHER_UUID)

  fireEvent.press(await screen.findByLabelText('More options'))
  fireEvent.press(screen.getByText('Block'))
  fireEvent.press(screen.getByLabelText('Block this explorer'))

  await waitFor(() => expect(blockUser).toHaveBeenCalled())

  const reset = resetSpy.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey))

  // The feed is the screen the acceptance criteria name first: B's posts have
  // to leave A's feed without a restart.
  expect(reset).toContain(JSON.stringify(['feed', 'following']))
  expect(reset).toContain(JSON.stringify(['discover-search']))
  expect(reset).toContain(JSON.stringify(['discover-people']))
  expect(reset).toContain(JSON.stringify(['explorer-posts', OTHER_UUID]))
})

test('an explorer already blocked is treated as blocked, not as a failure', async () => {
  // `POST /blocks` answers 200 with the existing row rather than erroring. A
  // client that only accepted 201 would report a failure on a successful block.
  ;(getProfile as jest.Mock).mockResolvedValue(profileFixture())
  ;(blockUser as jest.Mock).mockResolvedValue({ uuid: 'block-existing', created_at: null })

  renderProfile(OTHER_UUID)

  fireEvent.press(await screen.findByLabelText('More options'))
  fireEvent.press(screen.getByText('Block'))
  fireEvent.press(screen.getByLabelText('Block this explorer'))

  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled())
})

test('choosing Report opens the report form for the person, not for a post', async () => {
  ;(getProfile as jest.Mock).mockResolvedValue(profileFixture())
  ;(fileReport as jest.Mock).mockResolvedValue({ uuid: 'report-1' })

  renderProfile(OTHER_UUID)

  fireEvent.press(await screen.findByLabelText('More options'))
  fireEvent.press(screen.getByText('Report'))
  fireEvent.press(screen.getByText('Harassment or bullying'))
  fireEvent.press(screen.getByLabelText('Submit report'))

  await waitFor(() =>
    expect(fileReport).toHaveBeenCalledWith(
      expect.objectContaining({ reportableType: 'user', reportableUuid: OTHER_UUID }),
    ),
  )
})

// ---------------------------------------------------------------------------
// The offline path (STOURIFY-120)
// ---------------------------------------------------------------------------

/**
 * A shop with a photocopy of yesterday's price list in the back room does not
 * shut when the phone line goes down — it hangs up a sign saying the prices may
 * be out of date and carries on serving people.
 *
 * The app keeps that photocopy: `shared/queryClient.ts` writes every finished
 * query to device storage and reads it back on the next start. So after a cold
 * start with no signal, the profile is usually already in hand. The screen just
 * never looked — it asked `isError` BEFORE it asked whether it held any data,
 * so one failed refresh threw the copy away and painted an error wall. Behind
 * that wall sat Settings, and behind Settings sat Blocked accounts and Offline
 * & sync, so with no network none of it could be reached (STOURIFY-118 found
 * this and routed around it; this card opens the door itself).
 *
 * The rule these tests hold is the one the posts grid on this same screen has
 * followed since STOURIFY-87: **content beats an error.** Seeding the query
 * cache and then failing the request is exactly the shape a rehydrated
 * persisted cache plus a dead network produces at runtime.
 */
describe('a failed profile refresh does not throw away a profile already in hand', () => {
  const MY_KEY = ['explorer-profile', 'me']

  function seededClient(key: unknown[], value: unknown) {
    const qc = trackQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }))
    qc.setQueryData(key, value)
    return qc
  }

  function mine() {
    return profileFixture({
      user_uuid: ME_UUID,
      viewer: { is_self: true, is_following: false, follow_status: null, follow_uuid: null },
    })
  }

  /**
   * Wait until the refresh has actually FAILED, not merely been issued.
   *
   * This gate is not ceremony — it is the reason two of these tests were
   * meaningless when they were first written. Asserting straight after
   * `getMyProfile` had been *called* read the screen in the window before the
   * rejection landed, so the cached profile was still on it and the test passed
   * against the unfixed screen. Reading the query's own recorded status is the
   * one signal that cannot be beaten by a race: once it says `error`, the screen
   * has had its answer and whatever it is showing is its final answer.
   */
  async function refreshHasFailed(qc: QueryClient, key: unknown[]) {
    await waitFor(() => expect(qc.getQueryState(key)?.status).toBe('error'))
  }

  test('renders the saved profile instead of the error wall', async () => {
    ;(getMyProfile as jest.Mock).mockRejectedValue(new Error('Network Error'))
    const qc = seededClient(MY_KEY, mine())

    renderProfile(undefined, qc)
    await refreshHasFailed(qc, MY_KEY)

    expect(screen.getByText('@santos_grace')).toBeTruthy()
    expect(screen.queryByText(/could not load your profile/i)).toBeNull()
  })

  test('says plainly that the saved profile may be out of date', async () => {
    // Silence would be the quiet lie: a follower count presented as current by
    // an app that has just failed to check it.
    ;(getMyProfile as jest.Mock).mockRejectedValue(new Error('Network Error'))
    const qc = seededClient(MY_KEY, mine())

    renderProfile(undefined, qc)
    await refreshHasFailed(qc, MY_KEY)

    expect(screen.getByText(/out of date/i)).toBeTruthy()
  })

  test('the saved profile still reaches Settings, which is the door this card is about', async () => {
    ;(getMyProfile as jest.Mock).mockRejectedValue(new Error('Network Error'))
    const qc = seededClient(MY_KEY, mine())

    renderProfile(undefined, qc)
    await refreshHasFailed(qc, MY_KEY)

    fireEvent.press(screen.getByText('Settings'))

    expect(navigation.navigate).toHaveBeenCalledWith('Settings')
  })

  test('with nothing saved at all, the failure still offers a way through to Settings', async () => {
    // The first-run-offline case, and the one where the saved copy has aged out
    // of the 24-hour window. There is nothing to render, so the wall stays — but
    // a wall with a door in it, because Blocked accounts and Offline & sync sit
    // behind Settings and neither needs a network.
    ;(getMyProfile as jest.Mock).mockRejectedValue(new Error('Network Error'))

    renderProfile()

    expect(await screen.findByText(/could not load your profile/i)).toBeTruthy()
    expect(screen.getByText('Try again')).toBeTruthy()

    fireEvent.press(screen.getByText('Settings'))

    expect(navigation.navigate).toHaveBeenCalledWith('Settings')
  })

  test('offers no Settings on a stack that does not register one', async () => {
    // The same screen is pushed onto Home, Discover and Activity, none of which
    // carry Settings — navigating to a route a stack does not have throws.
    routeNames = ['Home', 'PostDetail', 'Profile', 'Comments']
    ;(getMyProfile as jest.Mock).mockRejectedValue(new Error('Network Error'))

    renderProfile(ME_UUID)

    expect(await screen.findByText(/could not load your profile/i)).toBeTruthy()
    expect(screen.queryByText('Settings')).toBeNull()
  })

  test('a 403 clears the screen even when a saved copy is sitting there', async () => {
    // A block is the server's verdict, not a bad line. `GET /profiles/{them}`
    // answers 403 to the blocker and the blocked party alike (STOURIFY-36), and
    // serving the blocked explorer back out of the cache would undo that.
    ;(getProfile as jest.Mock).mockRejectedValue({
      response: { status: 403, data: { message: 'This profile is not available.' } },
    })
    const key = ['explorer-profile', OTHER_UUID]
    const qc = seededClient(key, profileFixture())

    renderProfile(OTHER_UUID, qc)
    await refreshHasFailed(qc, key)

    expect(screen.getByText(/not available/i)).toBeTruthy()
    expect(screen.queryByText('@santos_grace')).toBeNull()
  })

  test('a 404 does the same — an absent profile is not a stale one', async () => {
    ;(getProfile as jest.Mock).mockRejectedValue({ response: { status: 404 } })
    const key = ['explorer-profile', OTHER_UUID]
    const qc = seededClient(key, profileFixture())

    renderProfile(OTHER_UUID, qc)
    await refreshHasFailed(qc, key)

    expect(screen.getByText(/no profile found/i)).toBeTruthy()
    expect(screen.queryByText('@santos_grace')).toBeNull()
  })

  test('says nothing about staleness when the profile loads normally', async () => {
    ;(getMyProfile as jest.Mock).mockResolvedValue(mine())

    renderProfile()

    expect(await screen.findByText('@santos_grace')).toBeTruthy()
    expect(screen.queryByText(/out of date/i)).toBeNull()
  })
})
