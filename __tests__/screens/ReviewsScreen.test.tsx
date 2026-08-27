import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient } from '@tanstack/react-query'
import ReviewsScreen from '@/features/reviews/screens/ReviewsScreen'
import { createLocalReview } from '@/features/reviews/api/createLocalReview'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'
import { trackQueryClient } from '../support/queryClients'

jest.mock('@/shared/api/reviews', () => ({
  getSpotReviews: jest.fn(),
}))

// The header names the spot the reviews are about (STOURIFY-209), read from the
// same cache key the spot page fills.
jest.mock('@/shared/api/spots', () => ({
  getSpot: jest.fn().mockResolvedValue({ uuid: 'spot-1', title: 'Blue Cove' }),
}))

import { getSpotReviews } from '@/shared/api/reviews'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function makeServerReview(overrides: Partial<any> = {}) {
  return {
    uuid: 'review-server-1',
    rating: 5,
    body: 'Stunning sunrise.',
    helpful_count: 3,
    spot_uuid: 'spot-1',
    author_uuid: 'u1',
    author: { uuid: 'u1', name: 'Ana Martinez', username: 'ana', avatar_url: null },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    can: {},
    ...overrides,
  }
}

function renderScreen(database = createTestDatabase(), spotId = 'spot-1') {
  return render(
    <TestProviders database={database}>
      <ReviewsScreen navigation={navigation} route={{ params: { spotId } } as any} />
    </TestProviders>,
  )
}

beforeEach(() => jest.clearAllMocks())

it('renders the server review with the reviewer name, rating and body', async () => {
  ;(getSpotReviews as jest.Mock).mockResolvedValue({
    data: [makeServerReview()],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 1 },
  })

  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('Ana Martinez')).toBeTruthy()
    expect(screen.getByText('Stunning sunrise.')).toBeTruthy()
  })
})

it('merges a queued local review with the server list, newest first, with a queued badge', async () => {
  const database = createTestDatabase()

  ;(getSpotReviews as jest.Mock).mockResolvedValue({
    data: [makeServerReview({ created_at: '2020-01-01T00:00:00Z' })],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 1 },
  })

  await createLocalReview(database, {
    spotId: null,
    spotUuid: 'spot-1',
    rating: 4,
    body: 'Fresh local write.',
  })

  renderScreen(database)

  await waitFor(() => {
    expect(screen.getByText('Fresh local write.')).toBeTruthy()
    expect(screen.getByText('Ana Martinez')).toBeTruthy()
    expect(screen.getByText('Queued ↑')).toBeTruthy()
  })

  // Newest (the just-written local review) renders before the older server one.
  const bodies = screen
    .getAllByText(/Fresh local write\.|Stunning sunrise\./)
    .map((n) => n.props.children)
  expect(bodies[0]).toBe('Fresh local write.')
})

it('shows an empty state when there are no reviews at all', async () => {
  ;(getSpotReviews as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })

  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('No reviews yet')).toBeTruthy()
  })
})

/**
 * The three situations this screen used to answer with one sentence
 * (STOURIFY-85).
 *
 * "We are still asking", "we could not ask" and "we asked and there is
 * nothing" are different facts with different remedies, and only the middle
 * one has an action worth offering. Before this card a failed request fell
 * into the empty branch and told the reader the spot had no reviews — a claim
 * about the spot, made on the strength of a timeout.
 *
 * Each case asserts the presence of its own copy AND the absence of the
 * others'. Presence alone would pass against a screen that stacked all three,
 * which is not a screen that tells them apart.
 */
describe('a failed review request is not an unreviewed spot', () => {
  it('says the request failed, and offers a retry that re-runs the query', async () => {
    ;(getSpotReviews as jest.Mock).mockRejectedValue(new Error('timeout of 15000ms exceeded'))

    renderScreen()

    await waitFor(() => expect(screen.getByText("Couldn't load the reviews")).toBeTruthy())
    expect(screen.queryByText('No reviews yet')).toBeNull()
    expect(screen.queryAllByLabelText('Loading')).toHaveLength(0)

    expect(getSpotReviews).toHaveBeenCalledTimes(1)

    fireEvent.press(screen.getByText('Try again'))

    await waitFor(() => expect(getSpotReviews).toHaveBeenCalledTimes(2))
  })

  it('still says there are no reviews when the request succeeds with none', async () => {
    ;(getSpotReviews as jest.Mock).mockResolvedValue({
      data: [],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 0 },
    })

    renderScreen()

    await waitFor(() => expect(screen.getByText('No reviews yet')).toBeTruthy())
    expect(screen.getByText('Be the first to write one.')).toBeTruthy()
    expect(screen.queryByText("Couldn't load the reviews")).toBeNull()
    expect(screen.queryByText('Try again')).toBeNull()
    expect(screen.queryAllByLabelText('Loading')).toHaveLength(0)
  })

  it('claims neither while the request is still in flight', async () => {
    // Never settles, so the screen stays in its first-load state.
    ;(getSpotReviews as jest.Mock).mockReturnValue(new Promise(() => {}))

    renderScreen()

    await waitFor(() => expect(screen.getAllByLabelText('Loading')).toHaveLength(3))
    expect(screen.queryByText('No reviews yet')).toBeNull()
    expect(screen.queryByText("Couldn't load the reviews")).toBeNull()
    expect(screen.queryByText('Try again')).toBeNull()
  })

  /**
   * The one thing that makes this screen different from its siblings.
   *
   * `useSpotReviews` merges rows out of the local WatermelonDB collection with
   * the server list, so somebody who has just written a review offline has
   * something to look at even when the server fetch fails. The error branch
   * lives inside `ListEmptyComponent`, which never renders while there are
   * rows — so it must not cover their own review with a network message.
   */
  it('keeps showing a queued local review when the server fetch fails', async () => {
    const database = createTestDatabase()

    ;(getSpotReviews as jest.Mock).mockRejectedValue(new Error('offline'))

    await createLocalReview(database, {
      spotId: null,
      spotUuid: 'spot-1',
      rating: 4,
      body: 'Written on the train, still queued.',
    })

    renderScreen(database)

    await waitFor(() =>
      expect(screen.getByText('Written on the train, still queued.')).toBeTruthy(),
    )
    await waitFor(() => expect(getSpotReviews).toHaveBeenCalled())

    expect(screen.getByText('Queued ↑')).toBeTruthy()
    expect(screen.queryByText("Couldn't load the reviews")).toBeNull()
    expect(screen.queryByText('No reviews yet')).toBeNull()
  })

  /**
   * The same protection from the other direction: rows React Query already
   * holds. Keep it as a regression guard, but know what it does NOT prove —
   * `isLoading` goes false as soon as anything is cached, so a hoisted branch
   * is never reached here and this test passes either way (STOURIFY-87's
   * finding). The cold-load assertion above is what discriminates.
   */
  it('keeps showing cached server reviews when a later fetch fails', async () => {
    ;(getSpotReviews as jest.Mock).mockRejectedValue(new Error('offline'))

    const seeded = trackQueryClient(
      new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
    )
    seeded.setQueryData(['spot-reviews', 'spot-1'], {
      data: [makeServerReview({ body: 'Cached from earlier.' })],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 1 },
    })

    render(
      <TestProviders database={createTestDatabase()} queryClient={seeded}>
        <ReviewsScreen navigation={navigation} route={{ params: { spotId: 'spot-1' } } as any} />
      </TestProviders>,
    )

    await waitFor(() => expect(getSpotReviews).toHaveBeenCalled())

    expect(screen.getByText('Cached from earlier.')).toBeTruthy()
    expect(screen.queryByText("Couldn't load the reviews")).toBeNull()
    expect(screen.queryByText('No reviews yet')).toBeNull()
  })
})

/**
 * STOURIFY-209 — "Reviews" does not say whose reviews.
 *
 * Arrive from a search result, or put the phone down and pick it up again, and
 * the page could be about anywhere.
 */
describe('the reviews header', () => {
  it('names the spot the reviews are about', async () => {
    renderScreen()

    await waitFor(() => {
      expect(screen.getByTestId('reviews-header-subtitle')).toBeTruthy()
    })

    expect(screen.getByText('Blue Cove')).toBeTruthy()
  })

  it('still shows the title and the way back', async () => {
    renderScreen()

    await waitFor(() => expect(screen.getByText('Reviews')).toBeTruthy())
    expect(screen.getByLabelText('Back')).toBeTruthy()
  })
})

/**
 * STOURIFY-211 — the button to write a review moved here from the spot page.
 *
 * It used to sit on the spot page, one line under the rating row that leads
 * here: the comment cards by the front door, the guest book in the back room.
 * Now it is on the page that shows you what other people wrote.
 *
 * It is pinned under the list rather than drawn inside it, so the three states
 * this screen has — loading, empty, and a list long enough to scroll — all
 * still show it. A list header would have scrolled away from the one person
 * most likely to press it: whoever just read to the bottom.
 */
describe('the write-a-review button', () => {
  it('is on the page when the spot already has reviews', async () => {
    ;(getSpotReviews as jest.Mock).mockResolvedValue({
      data: [makeServerReview()],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 1 },
    })

    renderScreen()

    await waitFor(() => expect(screen.getByText('Ana Martinez')).toBeTruthy())
    expect(screen.getByText('Write a review')).toBeTruthy()
  })

  it('is still on the page when the spot has none, which is where it is needed most', async () => {
    ;(getSpotReviews as jest.Mock).mockResolvedValue({
      data: [],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 0 },
    })

    renderScreen()

    // The empty state says "Be the first to write one." Before this card that
    // sentence was a dead end — there was nothing on the screen to write with.
    await waitFor(() => expect(screen.getByText('No reviews yet')).toBeTruthy())
    expect(screen.getByText('Write a review')).toBeTruthy()
  })

  it('opens the write-review form for the spot this page is about', async () => {
    ;(getSpotReviews as jest.Mock).mockResolvedValue({
      data: [],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 0 },
    })

    renderScreen(createTestDatabase(), 'spot-77')

    await waitFor(() => expect(screen.getByText('Write a review')).toBeTruthy())
    fireEvent.press(screen.getByText('Write a review'))

    expect(navigation.navigate).toHaveBeenCalledWith('WriteReview', { spotId: 'spot-77' })
  })
})
