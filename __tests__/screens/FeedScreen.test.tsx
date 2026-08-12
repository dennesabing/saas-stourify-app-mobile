import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context'
import FeedScreen from '@/features/feed/screens/FeedScreen'
import { asyncStoragePersister, PERSIST_BUSTER, PERSIST_MAX_AGE_MS } from '@/shared/queryClient'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/feed', () => ({
  getFollowingFeed: jest.fn(),
}))

jest.mock('@/shared/api/posts', () => ({
  toggleLike: jest.fn(),
}))

import { getFollowingFeed } from '@/shared/api/feed'
import { toggleLike } from '@/shared/api/posts'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const route = {} as any

const TEST_SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

function makePost(overrides: Partial<any> = {}) {
  return {
    id: '1',
    uuid: 'post-1',
    caption: 'Sunset at the cove',
    visibility: 'public',
    likes_count: 3,
    comments_count: 1,
    is_liked: false,
    created_at: new Date().toISOString(),
    author: { uuid: 'u1', name: 'Ana Martinez', username: 'ana', avatar_url: null },
    ...overrides,
  }
}

function renderScreen(queryClient?: QueryClient) {
  return render(
    <TestProviders database={createTestDatabase()} queryClient={queryClient}>
      <FeedScreen navigation={navigation} route={route} />
    </TestProviders>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

it('renders posts with author names', async () => {
  ;(getFollowingFeed as jest.Mock).mockResolvedValue({
    data: [makePost({ uuid: 'post-1' }), makePost({ uuid: 'post-2', author: { uuid: 'u2', name: 'Ben Cruz', username: 'ben', avatar_url: null } })],
    next_cursor: null,
    prev_cursor: null,
  })

  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('Ana Martinez')).toBeTruthy()
    expect(screen.getByText('Ben Cruz')).toBeTruthy()
  })
})

it('pulls the next page on end-reached', async () => {
  ;(getFollowingFeed as jest.Mock)
    .mockResolvedValueOnce({ data: [makePost({ uuid: 'post-1' })], next_cursor: 'cursor-2', prev_cursor: null })
    .mockResolvedValueOnce({ data: [makePost({ uuid: 'post-2' })], next_cursor: null, prev_cursor: null })

  renderScreen()

  await waitFor(() => expect(screen.getByText('Sunset at the cove')).toBeTruthy())

  fireEvent(screen.getByTestId('feed-list'), 'endReached')

  await waitFor(() => expect(getFollowingFeed).toHaveBeenCalledWith('cursor-2'))
})

it('flips the like state optimistically and rolls back on failure', async () => {
  ;(getFollowingFeed as jest.Mock).mockResolvedValue({
    data: [makePost({ uuid: 'post-1', is_liked: false, likes_count: 3 })],
    next_cursor: null,
    prev_cursor: null,
  })

  // A promise the test controls, so the optimistic flip can be observed
  // before the rejection reconciles it back — a mock that settles
  // immediately races the assertion.
  let rejectLike!: (err: Error) => void
  ;(toggleLike as jest.Mock).mockReturnValue(
    new Promise((_resolve, reject) => {
      rejectLike = reject
    }),
  )

  renderScreen()

  await waitFor(() => expect(screen.getByText('Sunset at the cove')).toBeTruthy())
  expect(screen.getByText('3')).toBeTruthy()

  fireEvent.press(screen.getByLabelText('Like'))

  // Optimistic: flips immediately, before the mutation has settled at all.
  await waitFor(() => expect(screen.getByText('4')).toBeTruthy())

  rejectLike(new Error('offline'))

  // Rolls back once the mutation fails.
  await waitFor(() => expect(screen.getByText('3')).toBeTruthy())
})

it('renders posts from a seeded query cache while the fetcher throws', async () => {
  await AsyncStorage.clear()
  ;(getFollowingFeed as jest.Mock).mockRejectedValue(new Error('offline'))

  const seeded = new QueryClient()
  seeded.setQueryData(['feed', 'following'], {
    pages: [{ data: [makePost({ uuid: 'cached-post' })], next_cursor: null, prev_cursor: null }],
    pageParams: [undefined],
  })

  await asyncStoragePersister.persistClient({
    buster: PERSIST_BUSTER,
    timestamp: Date.now(),
    clientState: {
      mutations: [],
      queries: seeded
        .getQueryCache()
        .getAll()
        .map((query) => ({
          queryKey: query.queryKey,
          queryHash: query.queryHash,
          state: query.state,
        })),
    },
  } as any)

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })

  render(
    <SafeAreaProvider initialMetrics={TEST_SAFE_AREA_METRICS}>
      <ThemeProvider scheme="light">
        <PersistQueryClientProvider
          client={client}
          persistOptions={{ persister: asyncStoragePersister, maxAge: PERSIST_MAX_AGE_MS, buster: PERSIST_BUSTER }}
        >
          <FeedScreen navigation={navigation} route={route} />
        </PersistQueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  )

  await waitFor(() => {
    expect(screen.getByText('Sunset at the cove')).toBeTruthy()
  })
})

/**
 * The two states STOURIFY-41 exists to tell apart.
 *
 * Both of these render zero rows, and before this card both said the same
 * thing — "Your feed is empty". They are different facts: one is about the
 * reader's account, the other is about the network, and only the second has an
 * action worth offering.
 *
 * Each case asserts the presence of its own copy AND the absence of the
 * other's. Presence alone would pass against a screen that stacked both
 * messages, which is not a screen that tells them apart.
 */
describe('a failed feed is not an empty feed', () => {
  it('says the request failed, and offers a retry that re-runs the query', async () => {
    ;(getFollowingFeed as jest.Mock).mockRejectedValue(new Error('timeout of 15000ms exceeded'))

    renderScreen()

    await waitFor(() => expect(screen.getByText("Couldn't load your feed")).toBeTruthy())
    expect(screen.queryByText('Your feed is empty')).toBeNull()

    expect(getFollowingFeed).toHaveBeenCalledTimes(1)

    fireEvent.press(screen.getByText('Try again'))

    await waitFor(() => expect(getFollowingFeed).toHaveBeenCalledTimes(2))
  })

  it('still says the feed is empty when the request succeeds with no posts', async () => {
    ;(getFollowingFeed as jest.Mock).mockResolvedValue({
      data: [],
      next_cursor: null,
      prev_cursor: null,
    })

    renderScreen()

    await waitFor(() => expect(screen.getByText('Your feed is empty')).toBeTruthy())
    expect(screen.queryByText("Couldn't load your feed")).toBeNull()
    expect(screen.queryByText('Try again')).toBeNull()
  })
})

/**
 * The tap path STOURIFY-35 exists for: from real content in the feed to the
 * author's profile. Registering the route was only half of it — the Home stack
 * had no `Profile` screen at all, so this navigate would have thrown.
 */
it('opens the author profile when the feed row identity is tapped', async () => {
  ;(getFollowingFeed as jest.Mock).mockResolvedValue({
    data: [makePost({ uuid: 'post-1' })],
    next_cursor: null,
    prev_cursor: null,
  })

  renderScreen()

  fireEvent.press(await screen.findByLabelText("Ana Martinez's profile"))

  expect(navigation.navigate).toHaveBeenCalledWith('Profile', { userId: 'u1' })
})

it('opening the post is still the card tap, not the author tap', async () => {
  ;(getFollowingFeed as jest.Mock).mockResolvedValue({
    data: [makePost({ uuid: 'post-1' })],
    next_cursor: null,
    prev_cursor: null,
  })

  renderScreen()

  fireEvent.press(await screen.findByLabelText('Post by Ana Martinez'))

  expect(navigation.navigate).toHaveBeenCalledWith('PostDetail', { postId: 'post-1' })
})
