import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import SpotDetailScreen from '@/features/spots/screens/SpotDetailScreen'
import type WishlistItem from '@/db/models/WishlistItem'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/spots', () => ({
  getSpot: jest.fn(),
  getSpotPosts: jest.fn(),
}))

import { getSpot, getSpotPosts } from '@/shared/api/spots'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function makeSpot(overrides: Partial<any> = {}) {
  return {
    id: 's1',
    uuid: 'spot-1',
    title: 'Blue Cove',
    slug: 'blue-cove',
    description: 'A quiet cove.',
    latitude: 6.1,
    longitude: 125.2,
    address: 'Coastal Road',
    status: 'active',
    categories: ['Nature', 'Viewpoint'],
    media: [
      { uuid: 'm1', url: 'https://cdn.test/photo1.jpg', thumb_url: null },
      { uuid: 'm2', url: 'https://cdn.test/photo2.jpg', thumb_url: null },
    ],
    rating_average: 4.5,
    reviews_count: 12,
    saves_count: 3,
    ...overrides,
  }
}

function renderScreen(database = createTestDatabase(), spotId = 'spot-1') {
  return render(
    <TestProviders database={database}>
      <SpotDetailScreen navigation={navigation} route={{ params: { spotId } } as any} />
    </TestProviders>,
  )
}

beforeEach(() => jest.clearAllMocks())

it('renders a real hero image, the rating and the review count', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  renderScreen()

  await waitFor(() => {
    expect(screen.getByTestId('spot-hero-image')).toBeTruthy()
    expect(screen.getByText('Blue Cove')).toBeTruthy()
    expect(screen.getByText('4.5')).toBeTruthy()
    expect(screen.getByText('See all 12 reviews')).toBeTruthy()
  })
})

it('renders a design-system placeholder hero when the spot has no photos, never a bare grey box', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot({ media: [] }))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  renderScreen()

  await waitFor(() => {
    expect(screen.queryByTestId('spot-hero-image')).toBeNull()
    expect(screen.getByText('No photos yet')).toBeTruthy()
  })
})

it('opens the gallery when the hero is tapped', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  renderScreen()

  await waitFor(() => expect(screen.getByTestId('spot-hero')).toBeTruthy())
  fireEvent.press(screen.getByTestId('spot-hero'))

  expect(navigation.navigate).toHaveBeenCalledWith('PhotoGallery', { spotId: 'spot-1' })
})

it('navigates to the reviews list and to write review', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  renderScreen()

  await waitFor(() => expect(screen.getByText('See all 12 reviews')).toBeTruthy())
  fireEvent.press(screen.getByText('See all 12 reviews'))
  expect(navigation.navigate).toHaveBeenCalledWith('Reviews', { spotId: 'spot-1' })

  fireEvent.press(screen.getByText('Write a review'))
  expect(navigation.navigate).toHaveBeenCalledWith('WriteReview', { spotId: 'spot-1' })
})

it('saves to the wishlist as a local write, never touching the network', async () => {
  const database = createTestDatabase()
  const fetchSpy = jest.fn()
  global.fetch = fetchSpy as unknown as typeof fetch

  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  renderScreen(database)

  await waitFor(() => expect(screen.getByText('Save')).toBeTruthy())
  fireEvent.press(screen.getByText('Save'))

  await waitFor(async () => {
    expect(await database.get<WishlistItem>('sto_wishlist_items').query().fetchCount()).toBe(1)
  })

  expect(fetchSpy).not.toHaveBeenCalled()

  await waitFor(() => {
    expect(screen.getByText('Saved ↑')).toBeTruthy()
  })

  const [item] = await database.get<WishlistItem>('sto_wishlist_items').query().fetch()
  expect(item.spotUuid).toBe('spot-1')
  expect(item.isQueued).toBe(true)
})

it('preserves the Posts and About tabs', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [{ uuid: 'post-1', caption: 'x', visibility: 'public', is_published: true, published_at: null, likes_count: 0, comments_count: 0, created_at: '', updated_at: '', can: {} }],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 1 },
  })

  renderScreen()

  await waitFor(() => expect(screen.getByText('Posts')).toBeTruthy())
  expect(screen.getByText('About')).toBeTruthy()

  fireEvent.press(screen.getByText('About'))
  await waitFor(() => expect(screen.getByText('A quiet cove.')).toBeTruthy())
})
