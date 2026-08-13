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

  // The loading placeholder must go once the answer is in. A skeleton left
  // mounted under real content is invisible in a screenshot and permanent in a
  // screen reader, which announces "Loading" over a spot that has finished.
  expect(screen.queryByTestId('spot-hero-loading')).toBeNull()
  expect(screen.queryByText('No photos yet')).toBeNull()
})

it('shows a loading hero, and says nothing about photos, while the spot request is still in flight', async () => {
  // A promise that never settles is the whole point: it holds the screen in the
  // state a slow network puts it in, for as long as the test looks at it.
  ;(getSpot as jest.Mock).mockReturnValue(new Promise(() => {}))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  renderScreen()

  await waitFor(() => expect(screen.getByTestId('spot-hero-loading')).toBeTruthy())

  // The two absences are the actual bug. "No photos yet" is a claim about a spot
  // nobody has heard back about yet, and asserting only that the placeholder
  // appeared would pass against a hero that rendered both of them stacked.
  expect(screen.queryByText('No photos yet')).toBeNull()
  expect(screen.queryByTestId('spot-hero-image')).toBeNull()

  // Nothing has loaded, so there is no gallery to open.
  fireEvent.press(screen.getByTestId('spot-hero'))
  expect(navigation.navigate).not.toHaveBeenCalled()
})

it('renders a design-system placeholder hero when the spot has no photos, never a bare grey box', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot({ media: [] }))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  renderScreen()

  await waitFor(() => {
    expect(screen.queryByTestId('spot-hero-image')).toBeNull()
    expect(screen.getByText('No photos yet')).toBeTruthy()
  })

  // …and only once the request has come back. The sentence is true here and was
  // false a moment ago; this pins the difference so the two states cannot
  // collapse back into one branch.
  expect(screen.queryByTestId('spot-hero-loading')).toBeNull()

  // A hero with no photos has no gallery to open, so tapping it must do nothing.
  // The screen enforces that with `disabled` on the hero Pressable; this pins the
  // behaviour so a refactor cannot drop it silently.
  fireEvent.press(screen.getByTestId('spot-hero'))
  expect(navigation.navigate).not.toHaveBeenCalled()
})

it('opens the gallery when the hero is tapped', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  renderScreen()

  // Wait for the hero PHOTO, not merely for the hero button. The button is on
  // screen from the first frame, but it is disabled until the spot's photos
  // arrive (`disabled={media.length === 0}`) — and React Native applies that
  // disabled flag to the underlying touch handler in an effect, one flush after
  // the element already renders as enabled. Waiting for `spot-hero` therefore
  // returns during the loading state and the press races that flush: green on an
  // idle machine, dropped under load (STOURIFY-62). `spot-hero-image` exists only
  // on the has-photos branch, so waiting for it waits for the actual precondition.
  await waitFor(() => expect(screen.getByTestId('spot-hero-image')).toBeTruthy())
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
