import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient } from '@tanstack/react-query'
import SpotReviewsTab from '@/features/spots/components/SpotReviewsTab'
import { createTestDatabase } from '../../support/testDatabase'
import { TestProviders } from '../../support/TestProviders'
import { trackQueryClient } from '../../support/queryClients'

jest.mock('@/shared/api/reviews', () => ({
  getSpotReviews: jest.fn(),
}))

import { getSpotReviews } from '@/shared/api/reviews'

function makeReview(overrides: Partial<any> = {}) {
  return {
    uuid: 'r1',
    rating: 5,
    body: 'Worth the climb.',
    helpful_count: 0,
    spot_uuid: 'spot-1',
    author: { uuid: 'u1', name: 'Mila Reyes', username: 'mila', avatar_url: null },
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    can: {},
    ...overrides,
  }
}

function page(rows: any[]) {
  return { data: rows, links: {}, meta: { current_page: 1, last_page: 1, total: rows.length } }
}

const onOpenReviews = jest.fn()

function renderTab(
  props: { reviewsCount?: number } = { reviewsCount: 12 },
  queryClient?: QueryClient,
) {
  return render(
    <TestProviders database={createTestDatabase()} queryClient={queryClient}>
      <SpotReviewsTab
        spotUuid="spot-1"
        reviewsCount={props.reviewsCount}
        onOpenReviews={onOpenReviews}
      />
    </TestProviders>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

/**
 * The tab is a shop window for the reviews, not the reviews themselves: one
 * review, the newest, and a door to the rest (STOURIFY-292). The server sends
 * them newest first, so "the newest" is the first row, and the second row must
 * NOT be drawn -- a tab that printed them all would be a second reviews screen.
 */
it('shows only the newest review, with who wrote it and when', async () => {
  ;(getSpotReviews as jest.Mock).mockResolvedValue(
    page([
      makeReview(),
      makeReview({ uuid: 'r2', body: 'Too crowded at noon.', author: { name: 'Ben Cruz' } }),
    ]),
  )

  renderTab()

  await waitFor(() => expect(screen.getByTestId('spot-review-newest')).toBeTruthy())
  expect(screen.getByText('Worth the climb.')).toBeTruthy()
  expect(screen.getByText('Mila Reyes')).toBeTruthy()
  expect(screen.getByText('2 days ago')).toBeTruthy()
  expect(screen.queryByText('Too crowded at noon.')).toBeNull()
})

it('opens every review from "Read all N reviews"', async () => {
  ;(getSpotReviews as jest.Mock).mockResolvedValue(page([makeReview()]))

  renderTab({ reviewsCount: 12 })

  await waitFor(() => expect(screen.getByText('Read all 12 reviews')).toBeTruthy())
  fireEvent.press(screen.getByText('Read all 12 reviews'))

  expect(onOpenReviews).toHaveBeenCalledTimes(1)
})

/**
 * The same cache key as the reviews screen, on purpose. A review the reader has
 * already fetched on either screen is on the other the moment it opens -- the
 * request below never answers, so the only way this review can be on screen is
 * the cache.
 */
it("reads the reviews screen's own cache, so a fetched review shows at once", async () => {
  const queryClient = trackQueryClient(
    new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  )
  queryClient.setQueryData(['spot-reviews', 'spot-1'], page([makeReview()]))
  ;(getSpotReviews as jest.Mock).mockReturnValue(new Promise(() => {}))

  renderTab({ reviewsCount: 1 }, queryClient)

  expect(screen.getByText('Worth the climb.')).toBeTruthy()
  expect(screen.queryByTestId('spot-reviews-loading')).toBeNull()
})

it('shows placeholders, and claims nothing, while the request is in flight', async () => {
  ;(getSpotReviews as jest.Mock).mockReturnValue(new Promise(() => {}))

  renderTab()

  await waitFor(() => expect(screen.getByTestId('spot-reviews-loading')).toBeTruthy())
  expect(screen.queryByText('No reviews yet')).toBeNull()
})

it('says the request failed, and retries it, rather than claiming there are no reviews', async () => {
  ;(getSpotReviews as jest.Mock).mockRejectedValue(new Error('offline'))

  renderTab()

  await waitFor(() => expect(screen.getByText("Couldn't load the reviews")).toBeTruthy())
  expect(screen.queryByText('No reviews yet')).toBeNull()

  const before = (getSpotReviews as jest.Mock).mock.calls.length
  fireEvent.press(screen.getByText('Try again'))
  await waitFor(() =>
    expect((getSpotReviews as jest.Mock).mock.calls.length).toBeGreaterThan(before),
  )
})

/**
 * No reviews at all. The way onward still goes to the reviews screen, which is
 * where writing one starts (STOURIFY-211) -- so the button says where it goes,
 * not "Write a review", which this page gave up on purpose.
 */
it('says there are no reviews yet, and still leads to the reviews screen', async () => {
  ;(getSpotReviews as jest.Mock).mockResolvedValue(page([]))

  renderTab({ reviewsCount: 0 })

  await waitFor(() => expect(screen.getByText('No reviews yet')).toBeTruthy())
  expect(screen.queryByText('Write a review')).toBeNull()
  expect(screen.queryByText('Read all 0 reviews')).toBeNull()

  fireEvent.press(screen.getByText('Open reviews'))
  expect(onOpenReviews).toHaveBeenCalledTimes(1)
})
