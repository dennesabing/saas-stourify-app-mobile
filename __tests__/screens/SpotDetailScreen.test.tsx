import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import { QueryClient } from '@tanstack/react-query'
import SpotDetailScreen from '@/features/spots/screens/SpotDetailScreen'
import type WishlistItem from '@/db/models/WishlistItem'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/spots', () => ({
  getSpot: jest.fn(),
  getSpotPosts: jest.fn(),
}))

import { getSpot, getSpotPosts } from '@/shared/api/spots'
import { trackQueryClient } from '../support/queryClients'

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

function renderScreen(database = createTestDatabase(), spotId = 'spot-1', queryClient?: QueryClient) {
  return render(
    <TestProviders database={database} queryClient={queryClient}>
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
    expect(screen.getByText('See all reviews')).toBeTruthy()
    expect(screen.getByText('✓ Verified')).toBeTruthy()
  })

  // The loading placeholder must go once the answer is in. A skeleton left
  // mounted under real content is invisible in a screenshot and permanent in a
  // screen reader, which announces "Loading" over a spot that has finished.
  expect(screen.queryByTestId('spot-hero-loading')).toBeNull()
  expect(screen.queryByText('No photos yet')).toBeNull()
  expect(screen.queryByTestId('spot-hero-error')).toBeNull()
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

  // Still asking is not the same as asked and failed. The failure copy belongs
  // to a request that came back broken, and this one has not come back at all.
  expect(screen.queryByText("Couldn't load this spot")).toBeNull()
})

it('says the request failed, and offers a retry, when the spot cannot be fetched', async () => {
  ;(getSpot as jest.Mock).mockRejectedValue(new Error('offline'))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  renderScreen()

  await waitFor(() => expect(screen.getByTestId('spot-hero-error')).toBeTruthy())
  expect(screen.getByText("Couldn't load this spot")).toBeTruthy()
  expect(screen.getByText('Try again')).toBeTruthy()

  // The three absences are what make this a fix rather than a fourth thing on
  // screen. Each names one of the states this one must not be confused with:
  // still waiting, loaded with photos, loaded with none.
  expect(screen.queryByTestId('spot-hero-loading')).toBeNull()
  expect(screen.queryByTestId('spot-hero-image')).toBeNull()
  expect(screen.queryByText('No photos yet')).toBeNull()

  // And nothing anywhere on the screen is still pulsing. `Skeleton` renders
  // with the accessibility label "Loading", so a screen reader would otherwise
  // keep announcing a request that finished — badly — some time ago. This is
  // the rating, which asked the same stuck question the hero did.
  expect(screen.queryAllByLabelText('Loading')).toHaveLength(0)
})

it('shows no spot facts and no spot actions when the spot cannot be fetched', async () => {
  ;(getSpot as jest.Mock).mockRejectedValue(new Error('offline'))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({
    data: [{ uuid: 'post-1', caption: 'x', visibility: 'public', is_published: true, published_at: null, likes_count: 0, comments_count: 0, created_at: '', updated_at: '', can: {} }],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 1 },
  })

  renderScreen()

  await waitFor(() => expect(screen.getByTestId('spot-hero-error')).toBeTruthy())

  // Everything in the details block is a fact about the spot or an action on
  // it, and there is no spot. `...` and "See all reviews" are the two the
  // card is named after; the rest come from the same block and would otherwise
  // sit under the error panel inviting the reader to review and bookmark a
  // place the app has just admitted it cannot identify.
  expect(screen.queryByText('...')).toBeNull()
  expect(screen.queryByText('See all reviews')).toBeNull()
  expect(screen.queryByText('Write a review')).toBeNull()
  expect(screen.queryByText('Save')).toBeNull()
  expect(screen.queryByText('✓ Verified')).toBeNull()

  // …and the presences are what keep this from quietly becoming the
  // whole-screen error panel that STOURIFY-64 rejected. The posts came from a
  // second, independent request that succeeded, so they stay.
  expect(screen.getByText('Posts')).toBeTruthy()
  expect(screen.getByText('About')).toBeTruthy()
})

it('renders no coordinates line on the About tab when the spot failed to load', async () => {
  ;(getSpot as jest.Mock).mockRejectedValue(new Error('offline'))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  renderScreen()

  await waitFor(() => expect(screen.getByTestId('spot-hero-error')).toBeTruthy())

  // The About tab is not mounted until it is selected, so this cannot be
  // folded into the case above: an assertion made on the Posts tab proves
  // nothing about a subtree that does not exist yet.
  fireEvent.press(screen.getByText('About'))

  // The line is asserted by its testID, not by the string it prints, and that
  // is deliberate. STOURIFY-65 was filed saying this renders
  // "undefined, undefined"; it does not. React drops an `undefined` child
  // entirely, so what actually reaches the screen is the literal comma and
  // space left between the two absent numbers — an orphan `, ` under the
  // address. Asserting the absent string would have passed against the bug.
  expect(screen.queryByTestId('spot-coordinates')).toBeNull()
  expect(screen.queryByText(', ')).toBeNull()
})

it('renders no coordinates line at all for a spot that has none', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot({ latitude: null, longitude: null }))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  // The second reader of the same bug, and the one nobody filed: a spot that
  // loaded perfectly well but carries no coordinates printed the same orphan
  // comma. Optional chaining stops `.toFixed()` throwing on an absent number;
  // it does not stop the rest of the line being drawn.
  await waitFor(() => expect(screen.getByText('A quiet cove.')).toBeTruthy())
  expect(screen.getByText('📍 Coastal Road')).toBeTruthy()
  expect(screen.queryByTestId('spot-coordinates')).toBeNull()
  expect(screen.queryByText(', ')).toBeNull()
})

it('renders the coordinates of a spot on the equator, which are real coordinates', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot({ latitude: 0, longitude: 0 }))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByText('About'))

  // The equator and the prime meridian are places, not missing data. This is
  // the case a `spot?.latitude && …` guard would silently swallow, which is
  // why the guard is written with `typeof`.
  await waitFor(() => expect(screen.getByTestId('spot-coordinates')).toBeTruthy())
  expect(screen.getByText('0.0000, 0.0000')).toBeTruthy()
})

it('re-runs the spot request when Try again is pressed', async () => {
  ;(getSpot as jest.Mock).mockRejectedValue(new Error('offline'))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  renderScreen()

  await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy())
  expect(getSpot).toHaveBeenCalledTimes(1)

  fireEvent.press(screen.getByText('Try again'))

  // Copy without a working button is a nicer dead end, not a way out.
  await waitFor(() => expect((getSpot as jest.Mock).mock.calls.length).toBeGreaterThan(1))
})

it('keeps showing a spot it already has while the refetch is failing', async () => {
  // The offline case, and the reason the failure branch is gated on `!spot`
  // rather than on `isError` alone. Yesterday's spot is in the persisted cache,
  // today's network is gone: the reader should read the spot, not an apology
  // for not having one.
  const queryClient = trackQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }))
  queryClient.setQueryData(['spot', 'spot-1'], makeSpot())

  ;(getSpot as jest.Mock).mockRejectedValue(new Error('offline'))
  ;(getSpotPosts as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  renderScreen(createTestDatabase(), 'spot-1', queryClient)

  await waitFor(() => expect(getSpot).toHaveBeenCalled())

  expect(screen.getByTestId('spot-hero-image')).toBeTruthy()
  expect(screen.getByText('Blue Cove')).toBeTruthy()
  expect(screen.queryByTestId('spot-hero-error')).toBeNull()
  expect(screen.queryByText("Couldn't load this spot")).toBeNull()

  // The whole details block stays too, not just the hero and the title. A
  // failed-state rule that hid the reviews button here would be taking a real
  // number off the screen because a background request went wrong.
  expect(screen.getByText('See all reviews')).toBeTruthy()
  expect(screen.getByText('Save')).toBeTruthy()
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

  // …and the request succeeded, so nothing may suggest it did not.
  expect(screen.queryByTestId('spot-hero-error')).toBeNull()

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

  await waitFor(() => expect(screen.getByText('See all reviews')).toBeTruthy())
  fireEvent.press(screen.getByText('See all reviews'))
  expect(navigation.navigate).toHaveBeenCalledWith('Reviews', { spotId: 'spot-1' })

  fireEvent.press(screen.getByText('Write a review'))
  expect(navigation.navigate).toHaveBeenCalledWith('WriteReview', { spotId: 'spot-1' })
})

/**
 * Save used to sit on a row of its own below the reviews buttons, while the
 * rating line beside it was mostly empty space. Reading a spot is one glance —
 * "how good is it, and do I want to keep it?" — so the two belong on the same
 * line, the way a price and an add-to-basket button share a shelf edge
 * (STOURIFY-102).
 */
it('puts Save on the same row as the rating, as an icon-and-text button', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())
  ;(getSpotPosts as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  renderScreen()

  await waitFor(() => expect(screen.getByTestId('spot-rating-row')).toBeTruthy())

  const row = within(screen.getByTestId('spot-rating-row'))
  // The score comes from the Rating component, the words from the button — both
  // inside the one row is the whole claim.
  expect(row.getByText('4.5')).toBeTruthy()
  expect(row.getByText('Save')).toBeTruthy()
  expect(row.getByText('🔖')).toBeTruthy()
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

  // A spot that loaded shows its coordinates exactly as it always has. The
  // guard added for the failed state must not cost the working state anything.
  expect(screen.getByText('6.1000, 125.2000')).toBeTruthy()
})
