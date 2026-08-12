import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient } from '@tanstack/react-query'
import DiscoverScreen from '@/features/discover/screens/DiscoverScreen'
import { EXPLORE_SPOTS_QUERY_KEY } from '@/features/discover/api/exploreSpots'
import type { Spot } from '@/shared/api/types'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/spots', () => ({
  getSpots: jest.fn(),
}))

import { getSpots } from '@/shared/api/spots'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const route = {} as any

function makeSpot(overrides: Partial<Spot> = {}): Spot {
  return {
    id: '1',
    uuid: 'spot-1',
    title: 'Kalaklan Lighthouse',
    slug: 'kalaklan-lighthouse',
    latitude: 14.8,
    longitude: 120.28,
    status: 'active',
    categories: ['Heritage'],
    media: [{ uuid: 'media-1', url: 'https://cdn.test/original.jpg', thumb_url: 'https://cdn.test/thumb.jpg' }],
    rating_average: 4.5,
    reviews_count: 12,
    ...overrides,
  } as Spot
}

function page(spots: Spot[]) {
  return { data: spots, links: {}, meta: { current_page: 1, last_page: 1, total: spots.length } }
}

function renderScreen(queryClient?: QueryClient) {
  return render(
    <TestProviders database={createTestDatabase()} queryClient={queryClient}>
      <DiscoverScreen navigation={navigation} route={route} />
    </TestProviders>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getSpots as jest.Mock).mockResolvedValue(page([makeSpot()]))
})

it('renders a grid of spots from the spot index', async () => {
  renderScreen()

  await waitFor(() => expect(screen.getByText('Kalaklan Lighthouse')).toBeTruthy(), { timeout: 3000 })
  expect(getSpots).toHaveBeenCalled()
})

/**
 * The whole point of the card. A grid cell is about 170 points wide; the
 * original is a multi-megabyte photo. Asserting the *source* rather than
 * "an image rendered" is what makes this a real check — both versions draw a
 * picture and only one of them is affordable on a mobile connection.
 */
it('draws a cell from the thumbnail, not the full-size original', async () => {
  renderScreen()

  await waitFor(() => expect(screen.getByText('Kalaklan Lighthouse')).toBeTruthy(), { timeout: 3000 })

  // `expo-image` normalises whatever it is given into an array of sources, so
  // the assertion is against that shape rather than the object handed in.
  const image = screen.getAllByTestId('spot-card-image')[0]
  expect(image.props.source).toEqual([{ uri: 'https://cdn.test/thumb.jpg' }])
})

/**
 * A spot whose photo has not been converted yet sends `thumb_url: null`. The
 * tempting fix is `thumb_url ?? url`, which quietly puts the whole grid back on
 * full-size originals the first time a conversion is slow. The placeholder tile
 * is the correct answer, so it is asserted rather than left to a comment.
 */
it('shows a placeholder rather than falling back to the original when no thumb exists', async () => {
  ;(getSpots as jest.Mock).mockResolvedValue(
    page([makeSpot({ media: [{ uuid: 'media-1', url: 'https://cdn.test/original.jpg', thumb_url: null }] })]),
  )

  renderScreen()

  await waitFor(() => expect(screen.getByText('Kalaklan Lighthouse')).toBeTruthy(), { timeout: 3000 })

  // No sources at all — not one source pointing at the original.
  const image = screen.getAllByTestId('spot-card-image')[0]
  expect(image.props.source).toEqual([])
  expect(JSON.stringify(image.props.source)).not.toContain('original.jpg')
})

/**
 * Stourify is used outdoors, so the grid has to behave like a magazine already
 * in your bag: still readable in a tunnel. `queryClient.setQueryData` stands in
 * for the persisted AsyncStorage cache rehydrating at launch, and the rejected
 * fetch stands in for having no signal.
 *
 * This is the assertion a well-meaning `if (isError) return <Error/>` early
 * return deletes without anyone noticing, because online it never fires.
 */
it('keeps showing cached spots when the network refuses', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  queryClient.setQueryData(EXPLORE_SPOTS_QUERY_KEY, [makeSpot({ title: 'Cached Cove' })])
  ;(getSpots as jest.Mock).mockRejectedValue(new Error('Network request failed'))

  renderScreen(queryClient)

  await waitFor(() => expect(getSpots).toHaveBeenCalled(), { timeout: 3000 })
  expect(screen.getByText('Cached Cove')).toBeTruthy()
})

it('opens a spot from its cell', async () => {
  renderScreen()

  await waitFor(() => expect(screen.getByText('Kalaklan Lighthouse')).toBeTruthy(), { timeout: 3000 })
  fireEvent.press(screen.getByText('Kalaklan Lighthouse'))

  expect(navigation.navigate).toHaveBeenCalledWith('SpotDetail', { spotId: 'spot-1' })
})

/**
 * An empty grid and a grid that has not loaded yet look identical, and the
 * second one is not a statement about the world.
 */
it('says it is loading rather than claiming there is nothing to explore', async () => {
  ;(getSpots as jest.Mock).mockReturnValue(new Promise(() => {}))

  renderScreen()

  await waitFor(() => expect(screen.getByText('Finding spots…')).toBeTruthy(), { timeout: 3000 })
  expect(screen.queryByText('Nothing to explore yet')).toBeNull()
})

it('reports a genuinely empty index as empty', async () => {
  ;(getSpots as jest.Mock).mockResolvedValue(page([]))

  renderScreen()

  await waitFor(() => expect(screen.getByText('Nothing to explore yet')).toBeTruthy(), { timeout: 3000 })
})

/**
 * Nothing cached and no signal is a different situation from an empty index,
 * and it has a different remedy — try again, rather than go and add a spot.
 */
it('offers a retry when there is neither a network nor a cache', async () => {
  ;(getSpots as jest.Mock).mockRejectedValue(new Error('Network request failed'))

  renderScreen()

  await waitFor(() => expect(screen.getByText("Can't reach Stourify")).toBeTruthy(), { timeout: 3000 })
})

it('keeps the search and nearby entry points', async () => {
  renderScreen()

  await waitFor(() => expect(screen.getByText('Kalaklan Lighthouse')).toBeTruthy(), { timeout: 3000 })

  fireEvent.press(screen.getByText('Spots near me'))
  expect(navigation.navigate).toHaveBeenCalledWith('Nearby')
})
