import { AxiosError, type AxiosResponse } from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
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

jest.mock('@/shared/api/wishlist', () => ({
  WISHLIST_QUERY_KEY: ['wishlist'],
  getWishlist: jest.fn(),
}))

import { Linking } from 'react-native'
import { getWishlist } from '@/shared/api/wishlist'
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
    home_city: {
      uuid: 'c1',
      name: 'General Santos',
      region: 'SOCCSKSARGEN',
      country: 'PH',
      is_featured: true,
    },
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
const PROFILE_STACK_ROUTES = [
  'Profile',
  'FollowList',
  'EditProfile',
  'Settings',
  'PostDetail',
  'Drafts',
  'SyncStatus',
  'SpotDetail',
]

let routeNames = PROFILE_STACK_ROUTES

/**
 * `stackIndex` decides whether the round back button is drawn: a profile
 * pushed from the feed sits above something in its own stack (index 1+), the
 * Profile tab's own root does not (index 0, the default).
 *
 * `canGoBack` is here to prove the screen does NOT ask it. On the emulator the
 * tab bar above the Profile stack answered yes — it remembered the Home tab —
 * and the Profile tab's root drew a Back button (STOURIFY-288).
 */
let stackIndex = 0
let canGoBack = false

/** The rendered screen's own route key — the last entry in the stack below. */
const PROFILE_ROUTE_KEY = 'profile-route'

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: () => canGoBack,
  // The stack as React Navigation reports it: `stackIndex` routes below this
  // screen, then this screen. The screen asks whether it is the FIRST route.
  getState: () => ({
    routeNames,
    index: stackIndex,
    routes: [
      ...Array.from({ length: stackIndex }, (_, i) => ({ key: `below-${i}` })),
      { key: PROFILE_ROUTE_KEY },
    ],
  }),
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
  const qc =
    queryClient ??
    trackQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }))
  resetSpy = jest.spyOn(qc, 'resetQueries')
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ThemeProvider scheme="light">
        <QueryClientProvider client={qc}>
          <ProfileScreen
            navigation={navigation}
            route={{ key: PROFILE_ROUTE_KEY, params: userId ? { userId } : undefined } as any}
          />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  routeNames = PROFILE_STACK_ROUTES
  stackIndex = 0
  canGoBack = false
  ;(getWishlist as jest.Mock).mockResolvedValue([])
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
    profileFixture({
      user_uuid: ME_UUID,
      username: 'santos_ramil',
      viewer: { is_self: true, is_following: false, follow_status: null, follow_uuid: null },
    }),
  )

  renderProfile()

  await waitFor(() => expect(getMyProfile).toHaveBeenCalled())
  expect(getProfile).not.toHaveBeenCalled()
  expect(await screen.findByText('@santos_ramil')).toBeTruthy()
})

test('the own profile grid lists only my posts', async () => {
  ;(getMyProfile as jest.Mock).mockResolvedValue(
    profileFixture({
      user_uuid: ME_UUID,
      viewer: { is_self: true, is_following: false, follow_status: null, follow_uuid: null },
    }),
  )

  renderProfile()

  // `mine` is what makes this a profile grid rather than the whole visible
  // corpus — a bare GET /posts renders every author's work under my name.
  await waitFor(() => expect(getPosts).toHaveBeenCalledWith({ mine: true }))
})

test('the header renders the real counts, not a placeholder dash', async () => {
  ;(getMyProfile as jest.Mock).mockResolvedValue(
    profileFixture({
      user_uuid: ME_UUID,
      counts: { spots: 3, followers: 12, following: 7 },
      viewer: { is_self: true, is_following: false, follow_status: null, follow_uuid: null },
    }),
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

function mineFixture(over: Partial<ExplorerProfile> = {}): ExplorerProfile {
  return profileFixture({
    user_uuid: ME_UUID,
    viewer: { is_self: true, is_following: false, follow_status: null, follow_uuid: null },
    ...over,
  })
}

test('my own profile offers Edit profile, never a Follow button', async () => {
  ;(getMyProfile as jest.Mock).mockResolvedValue(mineFixture())

  renderProfile()

  // "Edit profile", lower-case p, as the design writes it — and on a button of
  // its own, so it has the room to show the whole label (STOURIFY-269).
  fireEvent.press(await screen.findByText('Edit profile'))

  expect(navigation.navigate).toHaveBeenCalledWith('EditProfile')
  expect(screen.queryByText('Follow')).toBeNull()
  // The Wishlist tab replaced this button (STOURIFY-288).
  expect(screen.queryByText('Saved spots')).toBeNull()
})

/**
 * The design keeps the page to identity and content and moves everything else
 * behind the round button at the top (STOURIFY-288). Each of the three was a
 * button on the page before, so each has to still arrive where it used to.
 */
test.each([
  ['Settings', 'Settings'],
  ['Drafts', 'Drafts'],
  ['Offline & sync', 'SyncStatus'],
])('my own profile menu offers %s, which opens %s', async (label, route) => {
  ;(getMyProfile as jest.Mock).mockResolvedValue(mineFixture())

  renderProfile()

  fireEvent.press(await screen.findByLabelText('Profile menu'))
  fireEvent.press(screen.getByText(label))

  expect(navigation.navigate).toHaveBeenCalledWith(route)
})

test('my own profile menu never offers Block or Report', async () => {
  ;(getMyProfile as jest.Mock).mockResolvedValue(mineFixture())

  renderProfile()

  fireEvent.press(await screen.findByLabelText('Profile menu'))

  expect(screen.queryByText('Block')).toBeNull()
  expect(screen.queryByText('Report')).toBeNull()
})

test('my own profile inside the feed stack hides actions that stack cannot reach', async () => {
  // Tapping my own post in the feed opens MY profile on the Home stack, which
  // registers no EditProfile, Settings, Drafts or SyncStatus. Offering them
  // there navigates to a route that does not exist and throws.
  routeNames = ['Home', 'PostDetail', 'Profile', 'Comments']
  ;(getMyProfile as jest.Mock).mockResolvedValue(mineFixture())

  renderProfile(ME_UUID)

  expect(await screen.findByText('@santos_grace')).toBeTruthy()
  expect(screen.queryByText('Edit profile')).toBeNull()
  expect(screen.queryByLabelText('Profile menu')).toBeNull()
})

// ---------------------------------------------------------------------------
// The header and the tabs (STOURIFY-288)
// ---------------------------------------------------------------------------

test('the handle line carries the home city beside the username', async () => {
  ;(getProfile as jest.Mock).mockResolvedValue(profileFixture())

  renderProfile(OTHER_UUID)

  // Two pieces on one line rather than one string, so the handle stays
  // findable on its own the way every other test here finds it.
  expect(await screen.findByText('@santos_grace')).toBeTruthy()
  expect(screen.getByText('General Santos')).toBeTruthy()
})

test('the website is a link, and tapping it opens the address', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  ;(getProfile as jest.Mock).mockResolvedValue(profileFixture({ website: 'grace.example.com' }))

  renderProfile(OTHER_UUID)

  fireEvent.press(await screen.findByText('grace.example.com'))

  // People type the address without a scheme, and a bare host is not
  // something the phone knows how to open.
  expect(open).toHaveBeenCalledWith('https://grace.example.com')
  open.mockRestore()
})

test('a profile pushed from elsewhere has a back button', async () => {
  // Pushed onto the Home stack from the feed: one route below it.
  stackIndex = 1
  canGoBack = true
  ;(getProfile as jest.Mock).mockResolvedValue(profileFixture())

  renderProfile(OTHER_UUID)

  fireEvent.press(await screen.findByLabelText('Back'))

  expect(navigation.goBack).toHaveBeenCalled()
})

test('the Profile tab itself has no back button, even when the tab bar could go back', async () => {
  // Exactly what the emulator showed: arriving from the Home tab, the tab bar
  // answers canGoBack() with yes. The Profile stack's own root still has
  // nothing below it, and a Back button there would only switch tabs.
  stackIndex = 0
  canGoBack = true
  ;(getMyProfile as jest.Mock).mockResolvedValue(mineFixture())

  renderProfile()

  expect(await screen.findByText('@santos_grace')).toBeTruthy()
  expect(screen.queryByLabelText('Back')).toBeNull()
})

describe('the Wishlist tab on my own profile', () => {
  const saved = [
    {
      uuid: 'wish-1',
      note: null,
      is_downloaded_offline: false,
      created_at: '2026-09-01T00:00:00Z',
      spot: {
        uuid: 'spot-1',
        title: 'Gumasa Beach',
        categories: ['Nature'],
        rating_average: 4.5,
        reviews_count: 2,
        address: 'Glan, Sarangani',
        media: [],
      },
    },
  ]

  test('lists my saved spots, and only asks for them once the tab is opened', async () => {
    ;(getMyProfile as jest.Mock).mockResolvedValue(mineFixture())
    ;(getWishlist as jest.Mock).mockResolvedValue(saved)

    renderProfile()

    const tab = await screen.findByLabelText('Wishlist')
    // Most visits never open the tab, so they should not pay for the request.
    expect(getWishlist).not.toHaveBeenCalled()

    fireEvent.press(tab)

    fireEvent.press(await screen.findByText('Gumasa Beach'))
    expect(getWishlist).toHaveBeenCalledTimes(1)
    expect(navigation.navigate).toHaveBeenCalledWith('SpotDetail', { spotId: 'spot-1' })
  })

  test('says so when nothing is saved yet', async () => {
    ;(getMyProfile as jest.Mock).mockResolvedValue(mineFixture())

    renderProfile()

    fireEvent.press(await screen.findByLabelText('Wishlist'))

    expect(await screen.findByText('Nothing saved yet')).toBeTruthy()
  })

  /**
   * The live run's third finding (STOURIFY-288). A spot saved on its own page
   * did not appear here on the way back: this screen stays mounted between
   * visits, and a tab that was already open never asked the server again. The
   * Saved spots screen fixed exactly this in STOURIFY-200, and the tab now
   * refetches on focus the same way.
   */
  test('a spot saved elsewhere appears when I come back to my profile', async () => {
    const focusListeners: Array<() => void> = []
    navigation.addListener = jest.fn((event: string, callback: () => void) => {
      if (event === 'focus') focusListeners.push(callback)
      return () => {}
    })
    const focus = () => act(() => focusListeners.forEach((callback) => callback()))
    ;(getMyProfile as jest.Mock).mockResolvedValue(mineFixture())

    try {
      renderProfile()
      // The screen's first focus, on arrival — the hook deliberately skips it.
      focus()

      fireEvent.press(await screen.findByLabelText('Wishlist'))
      expect(await screen.findByText('Nothing saved yet')).toBeTruthy()

      // Away to a spot page, the heart tapped there, and back again.
      ;(getWishlist as jest.Mock).mockResolvedValue(saved)
      focus()

      expect(await screen.findByText('Gumasa Beach')).toBeTruthy()
    } finally {
      delete navigation.addListener
    }
  })

  test('switching back to the Wishlist tab asks for the list again', async () => {
    ;(getMyProfile as jest.Mock).mockResolvedValue(mineFixture())

    renderProfile()

    fireEvent.press(await screen.findByLabelText('Wishlist'))
    expect(await screen.findByText('Nothing saved yet')).toBeTruthy()

    fireEvent.press(screen.getByLabelText('Spots'))
    ;(getWishlist as jest.Mock).mockResolvedValue(saved)
    fireEvent.press(screen.getByLabelText('Wishlist'))

    expect(await screen.findByText('Gumasa Beach')).toBeTruthy()
  })

  test("somebody else's profile has a Spots tab and no Wishlist tab", async () => {
    // Your saves are yours. The server would refuse another explorer's list
    // anyway; the tab is simply not offered.
    ;(getProfile as jest.Mock).mockResolvedValue(profileFixture())

    renderProfile(OTHER_UUID)

    expect(await screen.findByLabelText('Spots')).toBeTruthy()
    expect(screen.queryByLabelText('Wishlist')).toBeNull()
    expect(getWishlist).not.toHaveBeenCalled()
  })
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
    profileFixture({
      viewer: {
        is_self: false,
        is_following: true,
        follow_status: 'active',
        follow_uuid: 'edge-1',
      },
    }),
  )

  renderProfile(OTHER_UUID)

  // Queried by the ACTION label: "Following" as visible text also matches the
  // Following count stat, and the two are different things.
  expect(await screen.findByLabelText('Unfollow')).toBeTruthy()
  expect(screen.queryByLabelText('Follow')).toBeNull()
})

test('a pending request to a private account renders Requested, not Following', async () => {
  ;(getProfile as jest.Mock).mockResolvedValue(
    profileFixture({
      is_private: true,
      viewer: {
        is_self: false,
        is_following: false,
        follow_status: 'pending',
        follow_uuid: 'edge-2',
      },
    }),
  )

  renderProfile(OTHER_UUID)

  expect(await screen.findByText('Requested')).toBeTruthy()
  expect(screen.queryByLabelText('Follow')).toBeNull()
})

test('unfollowing addresses the edge uuid the viewer block carries', async () => {
  ;(getProfile as jest.Mock).mockResolvedValue(
    profileFixture({
      viewer: {
        is_self: false,
        is_following: true,
        follow_status: 'active',
        follow_uuid: 'edge-1',
      },
    }),
  )
  ;(unfollow as jest.Mock).mockResolvedValue(undefined)

  renderProfile(OTHER_UUID)

  fireEvent.press(await screen.findByLabelText('Unfollow'))

  // The user uuid would 404 — DELETE /follows takes the EDGE's uuid.
  await waitFor(() => expect(unfollow).toHaveBeenCalledWith('edge-1'))
})

test('cancelling a pending request deletes the same edge', async () => {
  ;(getProfile as jest.Mock).mockResolvedValue(
    profileFixture({
      is_private: true,
      viewer: {
        is_self: false,
        is_following: false,
        follow_status: 'pending',
        follow_uuid: 'edge-2',
      },
    }),
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

    const seeded = trackQueryClient(
      new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
    )
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

test('my own profile has no block-and-report menu', async () => {
  // It has a menu of its own since STOURIFY-288 — Settings, Drafts, Offline &
  // sync — and that one is asserted above never to carry Block or Report.
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
    const qc = trackQueryClient(
      new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
    )
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

    // Behind the header's menu since STOURIFY-288 — still one tap from the
    // saved copy, and still reached with no network at all.
    fireEvent.press(screen.getByLabelText('Profile menu'))
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

/**
 * STOURIFY-249, following STOURIFY-225 and STOURIFY-248. Both of this screen's
 * failure panels answered every failure with a sentence about the connection,
 * including the one where the server answered and refused. Each panel gets the
 * pair: the first test alone would pass if the connection sentence were deleted
 * everywhere, which would break the one case where it is true.
 *
 * The own-profile panel keeps its headline, "We could not load your profile" —
 * two tests above assert its ABSENCE, and renaming it would leave them passing
 * whatever the screen did.
 */
describe('the failure it reports is the failure that happened', () => {
  function forbidden() {
    const config = { headers: {} } as never
    return new AxiosError('Request failed with status code 403', '403', config, {}, {
      status: 403,
      statusText: 'Forbidden',
      data: { message: 'This action is unauthorized.' },
      headers: {},
      config,
    } as AxiosResponse)
  }

  function unreachable() {
    return new AxiosError('Network Error', AxiosError.ERR_NETWORK, { headers: {} } as never, {})
  }

  const emptyPostsPage = { data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } }

  describe('the posts grid', () => {
    beforeEach(() => {
      ;(getMyProfile as jest.Mock).mockResolvedValue(
        profileFixture({
          user_uuid: ME_UUID,
          viewer: { is_self: true, is_following: false, follow_status: null, follow_uuid: null },
        }),
      )
    })

    test('does not blame the connection when the server answered 403', async () => {
      ;(getPosts as jest.Mock).mockRejectedValue(forbidden())

      renderProfile()

      expect(await screen.findByText("Couldn't load the posts")).toBeTruthy()
      expect(screen.queryByText(/check your connection/i)).toBeNull()
      expect(screen.getByText(/isn't allowed/i)).toBeTruthy()
      // The header loaded, so only the grid reports the refusal.
      expect(screen.getByText('@santos_grace')).toBeTruthy()
    })

    test('still blames the connection when there really was no answer', async () => {
      ;(getPosts as jest.Mock).mockRejectedValue(unreachable())

      renderProfile()

      expect(await screen.findByText("Couldn't load the posts")).toBeTruthy()
      expect(screen.getByText(/check your connection/i)).toBeTruthy()
    })
  })

  describe('your own profile', () => {
    beforeEach(() => {
      ;(getPosts as jest.Mock).mockResolvedValue(emptyPostsPage)
    })

    test('does not blame the connection when the server answered 403', async () => {
      ;(getMyProfile as jest.Mock).mockRejectedValue(forbidden())

      renderProfile()

      expect(await screen.findByText('We could not load your profile')).toBeTruthy()
      expect(screen.queryByText(/check your connection/i)).toBeNull()
      expect(screen.getByText(/isn't allowed/i)).toBeTruthy()
    })

    test('still blames the connection when there really was no answer', async () => {
      ;(getMyProfile as jest.Mock).mockRejectedValue(unreachable())

      renderProfile()

      expect(await screen.findByText('We could not load your profile')).toBeTruthy()
      expect(screen.getByText(/check your connection/i)).toBeTruthy()
    })
  })
})

/**
 * STOURIFY-278. Somebody else's profile had two failure outcomes: a 403 got the
 * block wording, and EVERYTHING else got the 404's "No profile found — This
 * explorer has not set up their profile yet." A dropped connection was reported
 * as a fact about the other person that nobody had checked.
 *
 * Three outcomes now, and each is pinned with a real `AxiosError` so the shared
 * helper reads it exactly as it reads a live failure:
 *
 * - **404** is the server saying the profile does not exist. Unchanged.
 * - **403** is a block, worded identically from both sides (STOURIFY-36). It
 *   must NOT pick up the helper's refusal sentence, which is a different claim.
 * - **anything else** says what happened, via `describeRequestFailure`, and
 *   offers Try again — a request that failed is worth retrying.
 */
describe("somebody else's profile tells a failed request apart from an absent one", () => {
  const config = { headers: {} } as never

  function answered(status: number, data: unknown = {}) {
    return new AxiosError(`Request failed with status code ${status}`, String(status), config, {}, {
      status,
      statusText: '',
      data,
      headers: {},
      config,
    } as AxiosResponse)
  }

  function unreachable() {
    return new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, {})
  }

  function timedOut() {
    return new AxiosError('timeout of 15000ms exceeded', AxiosError.ECONNABORTED, config, {})
  }

  test('a 404 still says the explorer has no profile, with only Go back', async () => {
    ;(getProfile as jest.Mock).mockRejectedValue(answered(404))

    renderProfile(OTHER_UUID)

    expect(await screen.findByText('No profile found')).toBeTruthy()
    expect(screen.getByText('This explorer has not set up their profile yet.')).toBeTruthy()
    expect(screen.getByText('Go back')).toBeTruthy()
    expect(screen.queryByText('Try again')).toBeNull()
  })

  test('a 403 keeps the block wording byte for byte, not the shared refusal sentence', async () => {
    ;(getProfile as jest.Mock).mockRejectedValue(
      answered(403, { message: 'This profile is not available.' }),
    )

    renderProfile(OTHER_UUID)

    expect(await screen.findByText('This profile is not available.')).toBeTruthy()
    expect(screen.getByText('You cannot view this explorer right now.')).toBeTruthy()
    expect(screen.queryByText(/isn't allowed/i)).toBeNull()
    expect(screen.queryByText('Try again')).toBeNull()
  })

  test('no answer at all says so, and never claims the explorer has no profile', async () => {
    ;(getProfile as jest.Mock).mockRejectedValue(unreachable())

    renderProfile(OTHER_UUID)

    expect(await screen.findByText("Couldn't load this profile")).toBeTruthy()
    expect(screen.getByText(/check your connection/i)).toBeTruthy()
    expect(screen.queryByText(/no profile found/i)).toBeNull()
    expect(screen.queryByText(/not set up their profile/i)).toBeNull()
    // The way out survives beside the retry.
    expect(screen.getByText('Go back')).toBeTruthy()
  })

  test('offers Try again, which re-runs the request and shows the profile when it answers', async () => {
    ;(getProfile as jest.Mock).mockRejectedValue(unreachable())

    renderProfile(OTHER_UUID)

    const retry = await screen.findByText('Try again')
    ;(getProfile as jest.Mock).mockResolvedValue(profileFixture())

    fireEvent.press(retry)

    expect(await screen.findByText('@santos_grace')).toBeTruthy()
    expect(getProfile).toHaveBeenCalledTimes(2)
  })

  test('a timeout says the server was slow, not that the explorer is missing', async () => {
    ;(getProfile as jest.Mock).mockRejectedValue(timedOut())

    renderProfile(OTHER_UUID)

    expect(await screen.findByText("Couldn't load this profile")).toBeTruthy()
    expect(screen.getByText(/took too long/i)).toBeTruthy()
    expect(screen.queryByText(/no profile found/i)).toBeNull()
  })

  test("a 500 says it went wrong on Stourify's end", async () => {
    ;(getProfile as jest.Mock).mockRejectedValue(answered(500))

    renderProfile(OTHER_UUID)

    expect(await screen.findByText("Couldn't load this profile")).toBeTruthy()
    expect(screen.getByText(/on Stourify's end/i)).toBeTruthy()
    expect(screen.queryByText(/no profile found/i)).toBeNull()
  })

  test('a profile already on screen stays there when a refresh gets no answer', async () => {
    // Content beats an error (STOURIFY-120, STOURIFY-279): only the server's
    // own verdict — a 403 or a 404 — may clear a profile already in hand.
    const key = ['explorer-profile', OTHER_UUID]
    const qc = trackQueryClient(
      new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
    )
    qc.setQueryData(key, profileFixture())
    ;(getProfile as jest.Mock).mockRejectedValue(unreachable())

    renderProfile(OTHER_UUID, qc)
    await waitFor(() => expect(qc.getQueryState(key)?.status).toBe('error'))

    expect(screen.getByText('@santos_grace')).toBeTruthy()
    expect(screen.queryByText("Couldn't load this profile")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The way into the Wishlist screen (STOURIFY-289)
// ---------------------------------------------------------------------------

describe('"See all" on the Wishlist tab', () => {
  const saved = [
    {
      uuid: 'wish-1',
      note: null,
      is_downloaded_offline: false,
      created_at: '2026-09-01T00:00:00Z',
      spot: {
        uuid: 'spot-1',
        title: 'Gumasa Beach',
        categories: ['Nature'],
        rating_average: 4.5,
        reviews_count: 2,
        address: 'Glan, Sarangani',
        media: [],
      },
    },
  ]

  test('opens the Wishlist screen, which nothing else in the app opens', async () => {
    routeNames = [...PROFILE_STACK_ROUTES, 'Wishlist']
    ;(getMyProfile as jest.Mock).mockResolvedValue(mineFixture())
    ;(getWishlist as jest.Mock).mockResolvedValue(saved)

    renderProfile()

    fireEvent.press(await screen.findByLabelText('Wishlist'))
    fireEvent.press(await screen.findByText('See all'))

    expect(navigation.navigate).toHaveBeenCalledWith('Wishlist')
  })

  test('is not drawn on a stack that has no Wishlist screen', async () => {
    ;(getMyProfile as jest.Mock).mockResolvedValue(mineFixture())
    ;(getWishlist as jest.Mock).mockResolvedValue(saved)

    renderProfile()

    fireEvent.press(await screen.findByLabelText('Wishlist'))
    await screen.findByText('Gumasa Beach')

    expect(screen.queryByText('See all')).toBeNull()
  })

  test('is not drawn when nothing is saved', async () => {
    routeNames = [...PROFILE_STACK_ROUTES, 'Wishlist']
    ;(getMyProfile as jest.Mock).mockResolvedValue(mineFixture())

    renderProfile()

    fireEvent.press(await screen.findByLabelText('Wishlist'))
    await screen.findByText('Nothing saved yet')

    expect(screen.queryByText('See all')).toBeNull()
  })
})
