import fs from 'fs'
import path from 'path'
import { AxiosError, type AxiosResponse } from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context'
import FollowListScreen from '@/features/profile/screens/FollowListScreen'
import { ThemeProvider } from '@/theme/ThemeProvider'
import type { ExplorerProfile } from '@/shared/api/profiles'

/**
 * Followers / Following — artboard 5 of the Profile design (STOURIFY-289).
 *
 * One screen with a switch, where there used to be two entries into one
 * hard-coded dark screen. The seams held here: the switch asks for the other
 * list, the search narrows what is already loaded without asking again, a row
 * opens its profile, and a private account's 403 reads as privacy rather than
 * as an empty list.
 */

jest.mock('@/shared/api/follows', () => ({
  getFollowers: jest.fn(),
  getFollowing: jest.fn(),
}))

jest.mock('@/shared/api/profiles', () => ({
  getMyProfile: jest.fn(),
  getProfile: jest.fn(),
}))

import { getFollowers, getFollowing } from '@/shared/api/follows'
import { getMyProfile, getProfile } from '@/shared/api/profiles'
import { useAuthStore } from '@/shared/store/auth'
import { trackQueryClient } from '../support/queryClients'

const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

const ME_UUID = 'user-me'
const OTHER_UUID = 'user-other'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function profileFixture(over: Partial<ExplorerProfile> = {}): ExplorerProfile {
  return {
    uuid: 'profile-1',
    user_uuid: ME_UUID,
    name: 'Ramil Santos',
    username: 'santos_ramil',
    bio: null,
    website: null,
    interests: [],
    home_city: null,
    is_private: false,
    counts: { spots: 3, followers: 12, following: 7 },
    viewer: { is_self: true, is_following: false, follow_status: null, follow_uuid: null },
    created_at: null,
    can: {},
    ...over,
  }
}

function page(rows: unknown[]) {
  return { data: rows, links: {}, meta: { current_page: 1, last_page: 1, total: rows.length } }
}

const FOLLOWERS = page([
  {
    uuid: 'edge-1',
    status: 'active',
    follower: { uuid: 'user-maya', name: 'Maya Reyes', username: 'mayaroams' },
    created_at: '2026-09-01T00:00:00Z',
  },
  {
    uuid: 'edge-2',
    status: 'active',
    follower: { uuid: 'user-diego', name: 'Diego Luna', username: 'diegolens' },
    created_at: '2026-09-01T00:00:00Z',
  },
])

const FOLLOWING = page([
  {
    uuid: 'edge-3',
    status: 'active',
    followee: { uuid: 'user-ana', name: 'Ana Park', username: 'anaparks' },
    created_at: '2026-09-01T00:00:00Z',
  },
])

function httpError(status: number) {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: {} as any,
    data: {},
  } as AxiosResponse)
}

function renderList(userId: string, type: 'followers' | 'following' = 'followers') {
  const qc = trackQueryClient(
    new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  )

  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ThemeProvider scheme="light">
        <QueryClientProvider client={qc}>
          <FollowListScreen
            navigation={navigation}
            route={{ key: 'follow-list', name: 'FollowList', params: { userId, type } } as any}
          />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  useAuthStore.setState({
    user: { id: '1', uuid: ME_UUID, name: 'Ramil Santos', email: 'me@dev.local' },
  } as any)
  ;(getMyProfile as jest.Mock).mockResolvedValue(profileFixture())
  ;(getProfile as jest.Mock).mockResolvedValue(
    profileFixture({
      user_uuid: OTHER_UUID,
      name: 'Grace Santos',
      counts: { spots: 1, followers: 40, following: 3 },
    }),
  )
  ;(getFollowers as jest.Mock).mockResolvedValue(FOLLOWERS)
  ;(getFollowing as jest.Mock).mockResolvedValue(FOLLOWING)
})

test('the header carries the name, and the switch carries both counts', async () => {
  renderList(ME_UUID)

  expect(await screen.findByText('Ramil Santos')).toBeTruthy()
  expect(await screen.findByText('12 Followers')).toBeTruthy()
  expect(screen.getByText('7 Following')).toBeTruthy()
})

test('my own list reads my profile under the key the Profile screen already filled', async () => {
  renderList(ME_UUID)

  await screen.findByText('12 Followers')
  expect(getMyProfile).toHaveBeenCalled()
  expect(getProfile).not.toHaveBeenCalled()
})

test("somebody else's list reads their profile", async () => {
  renderList(OTHER_UUID)

  expect(await screen.findByText('Grace Santos')).toBeTruthy()
  expect(await screen.findByText('40 Followers')).toBeTruthy()
  expect(getProfile).toHaveBeenCalledWith(OTHER_UUID)
  expect(getFollowers).toHaveBeenCalledWith(OTHER_UUID)
})

test('before the profile has answered, the switch still reads Followers and Following', async () => {
  ;(getMyProfile as jest.Mock).mockReturnValue(new Promise(() => {}))
  renderList(ME_UUID)

  expect(await screen.findByText('Followers')).toBeTruthy()
  expect(screen.getByText('Following')).toBeTruthy()
})

test('each row shows the name and the @username', async () => {
  renderList(ME_UUID)

  expect(await screen.findByText('Maya Reyes')).toBeTruthy()
  expect(screen.getByText('@mayaroams')).toBeTruthy()
  expect(screen.getByText('Diego Luna')).toBeTruthy()
  expect(screen.getByText('@diegolens')).toBeTruthy()
})

test('flipping the switch shows the other list', async () => {
  renderList(ME_UUID)

  await screen.findByText('Maya Reyes')
  expect(getFollowing).not.toHaveBeenCalled()

  fireEvent.press(await screen.findByLabelText('7 Following'))

  expect(await screen.findByText('Ana Park')).toBeTruthy()
  expect(getFollowing).toHaveBeenCalledWith(ME_UUID)
  expect(screen.queryByText('Maya Reyes')).toBeNull()
})

test('it opens on the list it was asked for', async () => {
  renderList(ME_UUID, 'following')

  expect(await screen.findByText('Ana Park')).toBeTruthy()
  expect(getFollowers).not.toHaveBeenCalled()
})

describe('search', () => {
  test('narrows the loaded list by name, without asking the server again', async () => {
    renderList(ME_UUID)
    await screen.findByText('Maya Reyes')

    fireEvent.changeText(screen.getByTestId('follow-list-search'), 'maya')

    expect(screen.getByText('Maya Reyes')).toBeTruthy()
    expect(screen.queryByText('Diego Luna')).toBeNull()
    expect(getFollowers).toHaveBeenCalledTimes(1)
  })

  test('matches the @username too', async () => {
    renderList(ME_UUID)
    await screen.findByText('Maya Reyes')

    fireEvent.changeText(screen.getByTestId('follow-list-search'), '@DIEGOL')

    expect(screen.getByText('Diego Luna')).toBeTruthy()
    expect(screen.queryByText('Maya Reyes')).toBeNull()
  })

  test('says so when nobody matches', async () => {
    renderList(ME_UUID)
    await screen.findByText('Maya Reyes')

    fireEvent.changeText(screen.getByTestId('follow-list-search'), 'zzz')

    expect(screen.getByText('No explorers match "zzz"')).toBeTruthy()
  })
})

test('a row opens that profile', async () => {
  renderList(ME_UUID)

  fireEvent.press(await screen.findByText('Maya Reyes'))

  expect(navigation.navigate).toHaveBeenCalledWith('Profile', { userId: 'user-maya' })
})

test('the back button goes back', async () => {
  renderList(ME_UUID)

  fireEvent.press(await screen.findByLabelText(/back/i))

  expect(navigation.goBack).toHaveBeenCalled()
})

test('an empty list says so, rather than drawing nothing', async () => {
  ;(getFollowers as jest.Mock).mockResolvedValue(page([]))
  renderList(ME_UUID)

  expect(await screen.findByText('No followers yet')).toBeTruthy()
})

test("a private account's 403 reads as privacy, not as an empty list", async () => {
  ;(getFollowers as jest.Mock).mockRejectedValue(httpError(403))
  renderList(OTHER_UUID)

  expect(await screen.findByText('This list is private')).toBeTruthy()
  expect(screen.queryByText('No followers yet')).toBeNull()
})

test('any other failure says the list did not load, with a way to try again', async () => {
  ;(getFollowers as jest.Mock).mockRejectedValue(httpError(500))
  renderList(ME_UUID)

  expect(await screen.findByText("Couldn't load followers")).toBeTruthy()
  expect(screen.getByText('Try again')).toBeTruthy()

  ;(getFollowers as jest.Mock).mockResolvedValue(FOLLOWERS)
  fireEvent.press(screen.getByText('Try again'))

  await waitFor(() => expect(screen.getByText('Maya Reyes')).toBeTruthy())
})

test('the screen writes no colour literals: every colour comes from the theme', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../src/features/profile/screens/FollowListScreen.tsx'),
    'utf8',
  )

  expect(source).not.toMatch(/'#/)
  expect(source).not.toMatch(/rgba\(/)
})
