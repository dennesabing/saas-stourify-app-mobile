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

import { getMyProfile, getProfile } from '@/shared/api/profiles'
import { getPosts, getUserPosts } from '@/shared/api/posts'
import { follow, unfollow } from '@/shared/api/follows'
import { useAuthStore } from '@/shared/store/auth'

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

function renderProfile(userId?: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
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
