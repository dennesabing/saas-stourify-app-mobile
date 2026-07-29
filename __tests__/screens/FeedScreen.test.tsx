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
