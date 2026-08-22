import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient } from '@tanstack/react-query'
import SearchScreen from '@/features/search/screens/SearchScreen'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/discover', () => ({
  searchDiscover: jest.fn(),
  searchDiscoverType: jest.fn(),
}))

/**
 * `getSpots` is mocked purely so the test can assert it is NEVER called. The
 * whole defect was that Search queried the plain spot index instead of the
 * discovery endpoint, and a screen that quietly kept both paths would look
 * identical on screen.
 */
jest.mock('@/shared/api/spots', () => ({
  getSpots: jest.fn(),
}))

import { searchDiscover, searchDiscoverType } from '@/shared/api/discover'
import { getSpots } from '@/shared/api/spots'
import { trackQueryClient } from '../support/queryClients'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const route = {} as any

const PREVIEW = {
  spots: [{ uuid: 'spot-1', title: 'Kalaklan Lighthouse', address: 'Olongapo' }],
  cities: [{ uuid: 'city-1', name: 'Olongapo', region: 'Central Luzon', country: 'PH' }],
  people: [
    { uuid: 'person-1', user_uuid: 'user-1', username: 'wander_grace', name: 'Grace', bio: null, is_private: false },
  ],
}

function renderScreen(queryClient?: QueryClient) {
  return render(
    <TestProviders database={createTestDatabase()} queryClient={queryClient}>
      <SearchScreen navigation={navigation} route={route} />
    </TestProviders>,
  )
}

/** The copy each of the four no-rows states shows, named once so a test can assert the absence of the other three. */
const PROMPT = 'Search Stourify'
const SEARCHING = 'Searching…'
const FAILED = "Couldn't run your search"
const NOTHING_FOUND = 'No results'

beforeEach(() => {
  jest.clearAllMocks()
  ;(searchDiscover as jest.Mock).mockResolvedValue(PREVIEW)
  ;(searchDiscoverType as jest.Mock).mockResolvedValue({
    data: PREVIEW.people,
    links: {},
    meta: { current_page: 1, last_page: 1, total: 1 },
  })
})

function type(text: string) {
  fireEvent.changeText(screen.getByPlaceholderText('Search spots, cities, people'), text)
}

it('queries /discover/search and never the plain spot index', async () => {
  renderScreen()
  type('kalaklan')

  await waitFor(() => expect(searchDiscover).toHaveBeenCalledWith('kalaklan'), { timeout: 3000 })
  expect(getSpots).not.toHaveBeenCalled()
})

it('renders all three result types in one sectioned list', async () => {
  renderScreen()
  type('kalaklan')

  await waitFor(() => expect(screen.getByText('Kalaklan Lighthouse')).toBeTruthy(), { timeout: 3000 })
  expect(screen.getByText('Olongapo, Central Luzon')).toBeTruthy()
  expect(screen.getByText('@wander_grace')).toBeTruthy()
})

/**
 * `SearchRequest` makes `q` `required|min:2`, so a one-character query is a 422
 * rather than an empty result set. The client must not send it at all.
 */
it('sends no request for a query the server is required to reject', async () => {
  renderScreen()
  type('k')

  await new Promise((resolve) => setTimeout(resolve, 600))
  expect(searchDiscover).not.toHaveBeenCalled()
  expect(searchDiscoverType).not.toHaveBeenCalled()
})

it('prompts rather than claiming there are no results before anything was searched', async () => {
  renderScreen()

  expect(screen.getByText(PROMPT)).toBeTruthy()
  expect(screen.queryByText(NOTHING_FOUND)).toBeNull()
  expect(screen.queryByText(FAILED)).toBeNull()
})

/**
 * The gate's other half. The test above is a screen nobody has touched; this is
 * a reader one keystroke in. Both are "we have not asked yet", and neither may
 * report an outcome — the existing test three above pins that no request goes
 * out, and this one pins that nothing false is said while none has.
 */
it('keeps prompting for a query too short to send, without claiming an outcome', async () => {
  renderScreen()
  type('k')

  await new Promise((resolve) => setTimeout(resolve, 600))

  expect(screen.getByText(PROMPT)).toBeTruthy()
  expect(screen.queryByText(NOTHING_FOUND)).toBeNull()
  expect(screen.queryByText(FAILED)).toBeNull()
})

/**
 * The chip row used to be six hardcoded category names with no server rule
 * behind them; it is now the endpoint's real `type` selector.
 */
it('filters by result type through the server, not client-side', async () => {
  renderScreen()
  type('kalaklan')

  await waitFor(() => expect(searchDiscover).toHaveBeenCalled(), { timeout: 3000 })

  // By role, not by text: "People" is also a section header once results land.
  fireEvent.press(screen.getByRole('button', { name: 'People' }))

  await waitFor(() => expect(searchDiscoverType).toHaveBeenCalledWith('kalaklan', 'people'), {
    timeout: 3000,
  })
  expect(screen.queryByText('Kalaklan Lighthouse')).toBeNull()
})

it('opens a spot from its result row', async () => {
  renderScreen()
  type('kalaklan')

  await waitFor(() => expect(screen.getByText('Kalaklan Lighthouse')).toBeTruthy(), { timeout: 3000 })
  fireEvent.press(screen.getByText('Kalaklan Lighthouse'))

  expect(navigation.navigate).toHaveBeenCalledWith('SpotDetail', { spotId: 'spot-1' })
})

/**
 * The people index being reachable is the point of the card — a person row
 * that renders but goes nowhere leaves it just as unreachable.
 */
it('opens a person from their result row', async () => {
  renderScreen()
  type('kalaklan')

  await waitFor(() => expect(screen.getByText('@wander_grace')).toBeTruthy(), { timeout: 3000 })
  fireEvent.press(screen.getByText('@wander_grace'))

  expect(navigation.navigate).toHaveBeenCalledWith('Profile', { userId: 'user-1' })
})

/**
 * A blank screen for the length of the request is indistinguishable from a
 * search that found nothing — which is exactly how it read on the emulator,
 * where the round trip takes seconds.
 */
it('says it is searching while the request is in flight', async () => {
  ;(searchDiscover as jest.Mock).mockReturnValue(new Promise(() => {}))

  renderScreen()
  type('kalaklan')

  await waitFor(() => expect(screen.getByText(SEARCHING)).toBeTruthy(), { timeout: 3000 })
  expect(screen.queryByText(NOTHING_FOUND)).toBeNull()
  expect(screen.queryByText(FAILED)).toBeNull()
})

it('reports an empty search as empty', async () => {
  ;(searchDiscover as jest.Mock).mockResolvedValue({ spots: [], cities: [], people: [] })

  renderScreen()
  type('zzzzz')

  await waitFor(() => expect(screen.getByText(NOTHING_FOUND)).toBeTruthy(), { timeout: 3000 })
  expect(screen.queryByText(FAILED)).toBeNull()
})

/**
 * The card itself (STOURIFY-59). A search that never got an answer used to
 * report that nothing matched — a shop assistant who could not open the
 * stockroom door telling you the item is out of stock. The absence assertion is
 * the half that matters: a screen stacking both messages would satisfy the
 * presence check alone and would not be a fix.
 */
it('says the search failed rather than that nothing matched', async () => {
  ;(searchDiscover as jest.Mock).mockRejectedValue(new Error('Network request failed'))

  renderScreen()
  type('kalaklan')

  await waitFor(() => expect(screen.getByText(FAILED)).toBeTruthy(), { timeout: 3000 })
  expect(screen.queryByText(NOTHING_FOUND)).toBeNull()
})

it('runs the search again when the failure state is retried', async () => {
  ;(searchDiscover as jest.Mock).mockRejectedValue(new Error('Network request failed'))

  renderScreen()
  type('kalaklan')

  await waitFor(() => expect(screen.getByText(FAILED)).toBeTruthy(), { timeout: 3000 })
  const callsBefore = (searchDiscover as jest.Mock).mock.calls.length

  fireEvent.press(screen.getByText('Try again'))

  await waitFor(
    () => expect((searchDiscover as jest.Mock).mock.calls.length).toBeGreaterThan(callsBefore),
    { timeout: 3000 },
  )
})

/**
 * Why the failure branch lives inside `ListEmptyComponent` and not above the
 * list. React Query keeps serving the rows it already holds while a later fetch
 * fails, and a no-rows branch cannot run while there are rows — so results the
 * reader is already reading can never be covered by an error. Hoisting the
 * check would delete that, and would never show that it had, because online the
 * branch is unreachable.
 */
it('keeps showing results already fetched when a later request fails', async () => {
  // `gcTime` is deliberately not the suite's usual `0`: a cache entry with no
  // observer yet is collected the instant it is written, so a seeded search
  // would be gone before the screen asked for it. The cost is a collection
  // timer that outlives the test — hence the `clear()` below, without which
  // jest sits for the five-minute default before the process can exit.
  const client = trackQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  client.setQueryData(['discover-search', 'all', 'kalaklan'], PREVIEW)
  ;(searchDiscover as jest.Mock).mockRejectedValue(new Error('Network request failed'))

  const { unmount } = renderScreen(client)

  try {
    type('kalaklan')

    await waitFor(() => expect(screen.getByText('Kalaklan Lighthouse')).toBeTruthy(), { timeout: 3000 })
    await waitFor(() => expect(searchDiscover).toHaveBeenCalled(), { timeout: 3000 })

    expect(screen.getByText('Kalaklan Lighthouse')).toBeTruthy()
    expect(screen.queryByText(FAILED)).toBeNull()
    expect(screen.queryByText(NOTHING_FOUND)).toBeNull()
  } finally {
    unmount()
    client.clear()
  }
})
