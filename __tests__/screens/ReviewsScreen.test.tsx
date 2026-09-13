import { AxiosError, type AxiosResponse } from 'axios'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import { QueryClient } from '@tanstack/react-query'
import ReviewsScreen from '@/features/reviews/screens/ReviewsScreen'
import { createLocalReview } from '@/features/reviews/api/createLocalReview'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'
import { trackQueryClient } from '../support/queryClients'

jest.mock('@/shared/api/reviews', () => ({
  getSpotReviews: jest.fn(),
  setReviewHelpful: jest.fn(),
}))

// The header names the spot the reviews are about (STOURIFY-209), read from the
// same cache key the spot page fills.
jest.mock('@/shared/api/spots', () => ({
  getSpot: jest.fn(),
}))

import { getSpotReviews, setReviewHelpful } from '@/shared/api/reviews'
import { getSpot } from '@/shared/api/spots'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function makeServerReview(overrides: Partial<any> = {}) {
  return {
    uuid: 'review-server-1',
    rating: 5,
    body: 'Stunning sunrise.',
    helpful_count: 3,
    marked_helpful: false,
    spot_uuid: 'spot-1',
    author_uuid: 'u1',
    author: { uuid: 'u1', name: 'Ana Martinez', username: 'ana', avatar_url: null },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    can: {},
    ...overrides,
  }
}

function page(data: unknown[]) {
  return { data, links: {}, meta: { current_page: 1, last_page: 1, total: data.length } }
}

function renderScreen(database = createTestDatabase(), spotId = 'spot-1') {
  return render(
    <TestProviders database={database}>
      <ReviewsScreen navigation={navigation} route={{ params: { spotId } } as any} />
    </TestProviders>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  // Set here rather than in the mock factory: `clearAllMocks` clears calls, not
  // implementations, so a test that overrides this would leak into the next.
  ;(getSpot as jest.Mock).mockResolvedValue({ uuid: 'spot-1', title: 'Blue Cove' })
})

it('renders the server review with the reviewer name, rating and body', async () => {
  ;(getSpotReviews as jest.Mock).mockResolvedValue(page([makeServerReview()]))

  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('Ana Martinez')).toBeTruthy()
    expect(screen.getByText('Stunning sunrise.')).toBeTruthy()
  })
  expect(screen.getByLabelText('Rated 5 out of 5')).toBeTruthy()
})

it('merges a queued local review with the server list, newest first, with a queued badge', async () => {
  const database = createTestDatabase()

  ;(getSpotReviews as jest.Mock).mockResolvedValue(
    page([makeServerReview({ created_at: '2020-01-01T00:00:00Z' })]),
  )

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
  ;(getSpotReviews as jest.Mock).mockResolvedValue(page([]))

  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('No reviews yet')).toBeTruthy()
  })
})

/**
 * The three situations this screen used to answer with one sentence
 * (STOURIFY-85): still asking, could not ask, and asked and there is nothing.
 * Each case asserts its own copy AND the absence of the others'.
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
    ;(getSpotReviews as jest.Mock).mockResolvedValue(page([]))

    renderScreen()

    await waitFor(() => expect(screen.getByText('No reviews yet')).toBeTruthy())
    expect(screen.getByText('Be the first to write one.')).toBeTruthy()
    expect(screen.queryByText("Couldn't load the reviews")).toBeNull()
    expect(screen.queryByText('Try again')).toBeNull()
    expect(screen.queryAllByLabelText('Loading')).toHaveLength(0)
  })

  it('claims neither while the request is still in flight', async () => {
    ;(getSpotReviews as jest.Mock).mockReturnValue(new Promise(() => {}))

    renderScreen()

    await waitFor(() => expect(screen.getAllByLabelText('Loading')).toHaveLength(3))
    expect(screen.queryByText('No reviews yet')).toBeNull()
    expect(screen.queryByText("Couldn't load the reviews")).toBeNull()
    expect(screen.queryByText('Try again')).toBeNull()
  })

  /**
   * `rows` merges the local `sto_reviews` collection with the server list, so
   * somebody who wrote a review offline has their own words on screen while
   * the server fetch fails. The error must not cover them.
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

  it('keeps showing cached server reviews when a later fetch fails', async () => {
    ;(getSpotReviews as jest.Mock).mockRejectedValue(new Error('offline'))

    const seeded = trackQueryClient(
      new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
    )
    seeded.setQueryData(
      ['spot-reviews', 'spot-1'],
      page([makeServerReview({ body: 'Cached from earlier.' })]),
    )

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
 * STOURIFY-209 — "Reviews" does not say whose reviews. Since STOURIFY-293 the
 * header is the design's round back bar, and the spot's name is its second line.
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
    fireEvent.press(screen.getByLabelText('Back'))
    expect(navigation.goBack).toHaveBeenCalled()
  })
})

/**
 * Artboard 3 of the Spot Hub design, "Reviews" (STOURIFY-293): the rating
 * summary at the top.
 */
describe('the rating summary', () => {
  it('shows the big average, its stars and how many reviews it comes from', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue({
      uuid: 'spot-1',
      title: 'Blue Cove',
      rating_average: 4.8,
      reviews_count: 12,
    })
    ;(getSpotReviews as jest.Mock).mockResolvedValue(page([makeServerReview()]))

    renderScreen()

    await waitFor(() => expect(screen.getByTestId('reviews-summary')).toBeTruthy())
    const summary = screen.getByTestId('reviews-summary')
    expect(within(summary).getByText('4.8')).toBeTruthy()
    expect(within(summary).getByText('12 reviews')).toBeTruthy()
    expect(within(summary).getByLabelText('Rated 4.8 out of 5')).toBeTruthy()
  })

  it('says "1 review", not "1 reviews"', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue({
      uuid: 'spot-1',
      title: 'Blue Cove',
      rating_average: 4,
      reviews_count: 1,
    })
    ;(getSpotReviews as jest.Mock).mockResolvedValue(page([makeServerReview({ rating: 4 })]))

    renderScreen()

    await waitFor(() => expect(screen.getByTestId('reviews-summary')).toBeTruthy())
    expect(within(screen.getByTestId('reviews-summary')).getByText('1 review')).toBeTruthy()
  })

  it('draws no summary, and no "0.0", for a spot nobody has rated', async () => {
    // A spot with no reviews comes back with `rating_average: 0` (`ratingFor`).
    ;(getSpot as jest.Mock).mockResolvedValue({
      uuid: 'spot-1',
      title: 'Blue Cove',
      rating_average: 0,
      reviews_count: 0,
    })
    ;(getSpotReviews as jest.Mock).mockResolvedValue(page([]))

    renderScreen()

    await waitFor(() => expect(screen.getByText('No reviews yet')).toBeTruthy())
    expect(screen.queryByTestId('reviews-summary')).toBeNull()
    expect(screen.queryByText('0.0')).toBeNull()
  })
})

describe('a review card', () => {
  it('says who wrote it and how long ago', async () => {
    ;(getSpotReviews as jest.Mock).mockResolvedValue(page([makeServerReview()]))

    renderScreen()

    await waitFor(() => expect(screen.getByText('Ana Martinez')).toBeTruthy())
    expect(screen.getByText(/^@ana · \d+ days? ago$/)).toBeTruthy()
  })

  it('does not draw what nothing backs: Reply, star filters, photo filters, ranks', async () => {
    ;(getSpotReviews as jest.Mock).mockResolvedValue(page([makeServerReview()]))

    renderScreen()

    await waitFor(() => expect(screen.getByText('Ana Martinez')).toBeTruthy())
    expect(screen.queryByText('Reply')).toBeNull()
    expect(screen.queryByText('With photos')).toBeNull()
    expect(screen.queryByText('★ 5')).toBeNull()
    expect(screen.queryByText(/local expert/i)).toBeNull()
  })
})

/**
 * "Helpful · N" — online only (STOURIFY-293). Reactions are not a synced table,
 * so there is deliberately no offline path: a vote with no signal says so and
 * changes nothing.
 */
describe('Helpful', () => {
  it('marks a review helpful and shows the count the server answers with', async () => {
    ;(getSpotReviews as jest.Mock).mockResolvedValue(page([makeServerReview()]))
    ;(setReviewHelpful as jest.Mock).mockResolvedValue({ helpful: true, helpful_count: 4 })

    renderScreen()

    await waitFor(() => expect(screen.getByText('Helpful · 3')).toBeTruthy())
    fireEvent.press(screen.getByTestId('review-helpful-review-server-1'))

    await waitFor(() => expect(screen.getByText('Helpful · 4')).toBeTruthy())
    expect(setReviewHelpful).toHaveBeenCalledWith('review-server-1', true)
    expect(
      screen.getByTestId('review-helpful-review-server-1').props.accessibilityState,
    ).toMatchObject({ selected: true })
  })

  it('takes the vote back when it is already marked', async () => {
    ;(getSpotReviews as jest.Mock).mockResolvedValue(
      page([makeServerReview({ marked_helpful: true })]),
    )
    ;(setReviewHelpful as jest.Mock).mockResolvedValue({ helpful: false, helpful_count: 2 })

    renderScreen()

    await waitFor(() => expect(screen.getByText('Helpful · 3')).toBeTruthy())
    fireEvent.press(screen.getByTestId('review-helpful-review-server-1'))

    await waitFor(() => expect(screen.getByText('Helpful · 2')).toBeTruthy())
    expect(setReviewHelpful).toHaveBeenCalledWith('review-server-1', false)
  })

  it('says it could not reach the server, and leaves the count alone, with no signal', async () => {
    ;(getSpotReviews as jest.Mock).mockResolvedValue(page([makeServerReview()]))
    ;(setReviewHelpful as jest.Mock).mockRejectedValue(
      new AxiosError('Network Error', AxiosError.ERR_NETWORK, { headers: {} } as never, {}),
    )

    renderScreen()

    await waitFor(() => expect(screen.getByText('Helpful · 3')).toBeTruthy())
    fireEvent.press(screen.getByTestId('review-helpful-review-server-1'))

    await waitFor(() =>
      expect(screen.getByTestId('review-helpful-error-review-server-1')).toBeTruthy(),
    )
    expect(screen.getByText("Couldn't reach the server")).toBeTruthy()
    expect(screen.getByText('Helpful · 3')).toBeTruthy()
  })

  it('offers no Helpful on a review still waiting to upload', async () => {
    const database = createTestDatabase()
    ;(getSpotReviews as jest.Mock).mockResolvedValue(page([]))

    const localId = await createLocalReview(database, {
      spotId: null,
      spotUuid: 'spot-1',
      rating: 5,
      body: 'Not on the server yet.',
    })

    renderScreen(database)

    await waitFor(() => expect(screen.getByText('Not on the server yet.')).toBeTruthy())
    expect(screen.getByText('Queued ↑')).toBeTruthy()
    expect(screen.queryByTestId(`review-helpful-${localId}`)).toBeNull()
    expect(screen.queryByText(/^Helpful/)).toBeNull()
  })
})

/**
 * STOURIFY-211 — the button to write a review lives on this page, pinned under
 * the list, so all three states still show it.
 */
describe('the write-a-review button', () => {
  it('is on the page when the spot already has reviews', async () => {
    ;(getSpotReviews as jest.Mock).mockResolvedValue(page([makeServerReview()]))

    renderScreen()

    await waitFor(() => expect(screen.getByText('Ana Martinez')).toBeTruthy())
    expect(screen.getByText('Write a review')).toBeTruthy()
  })

  it('is still on the page when the spot has none, which is where it is needed most', async () => {
    ;(getSpotReviews as jest.Mock).mockResolvedValue(page([]))

    renderScreen()

    await waitFor(() => expect(screen.getByText('No reviews yet')).toBeTruthy())
    expect(screen.getByText('Write a review')).toBeTruthy()
  })

  it('opens the write-review form for the spot this page is about', async () => {
    ;(getSpotReviews as jest.Mock).mockResolvedValue(page([]))

    renderScreen(createTestDatabase(), 'spot-77')

    await waitFor(() => expect(screen.getByText('Write a review')).toBeTruthy())
    fireEvent.press(screen.getByText('Write a review'))

    expect(navigation.navigate).toHaveBeenCalledWith('WriteReview', { spotId: 'spot-77' })
  })
})

/**
 * STOURIFY-248, following STOURIFY-225: say what actually failed.
 */
describe('the failure it reports is the failure that happened', () => {
  function forbidden() {
    const config = { headers: {} } as never
    return new AxiosError('Request failed with status code 403', '403', config, {}, {
      status: 403,
      statusText: 'Forbidden',
      data: { message: 'This action is unauthorized.' },
      headers: {},
      config,
    } as AxiosResponse)
  }

  it('does not blame the connection when the server answered 403', async () => {
    ;(getSpotReviews as jest.Mock).mockRejectedValue(forbidden())
    renderScreen()

    await waitFor(() => expect(screen.getByText("Couldn't load the reviews")).toBeTruthy())

    expect(screen.queryByText(/check your connection/i)).toBeNull()
    expect(screen.getByText(/isn't allowed/i)).toBeTruthy()
  })

  it('still blames the connection when there really was no answer', async () => {
    ;(getSpotReviews as jest.Mock).mockRejectedValue(
      new AxiosError('Network Error', AxiosError.ERR_NETWORK, { headers: {} } as never, {}),
    )
    renderScreen()

    await waitFor(() => expect(screen.getByText("Couldn't load the reviews")).toBeTruthy())

    expect(screen.getByText(/check your connection/i)).toBeTruthy()
  })
})
