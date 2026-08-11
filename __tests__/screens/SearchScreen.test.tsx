import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
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

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const route = {} as any

const PREVIEW = {
  spots: [{ uuid: 'spot-1', title: 'Kalaklan Lighthouse', address: 'Olongapo' }],
  cities: [{ uuid: 'city-1', name: 'Olongapo', region: 'Central Luzon', country: 'PH' }],
  people: [
    { uuid: 'person-1', user_uuid: 'user-1', username: 'wander_grace', name: 'Grace', bio: null, is_private: false },
  ],
}

function renderScreen() {
  return render(
    <TestProviders database={createTestDatabase()}>
      <SearchScreen navigation={navigation} route={route} />
    </TestProviders>,
  )
}

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

  expect(screen.getByText('Search Stourify')).toBeTruthy()
  expect(screen.queryByText('No results')).toBeNull()
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

  await waitFor(() => expect(screen.getByText('Searching…')).toBeTruthy(), { timeout: 3000 })
  expect(screen.queryByText('No results')).toBeNull()
})

it('reports an empty search as empty', async () => {
  ;(searchDiscover as jest.Mock).mockResolvedValue({ spots: [], cities: [], people: [] })

  renderScreen()
  type('zzzzz')

  await waitFor(() => expect(screen.getByText('No results')).toBeTruthy(), { timeout: 3000 })
})
