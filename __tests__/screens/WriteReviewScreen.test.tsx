import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient } from '@tanstack/react-query'
import WriteReviewScreen from '@/features/reviews/screens/WriteReviewScreen'
import type Review from '@/db/models/Review'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'
import { trackQueryClient } from '../support/queryClients'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

const PLACEHOLDER = 'Share your experience — what made this spot special?'

function seededClient(spot?: Record<string, unknown>) {
  const client = trackQueryClient(
    new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  )
  if (spot) client.setQueryData(['spot', 'spot-1'], spot)
  return client
}

function renderScreen(
  database = createTestDatabase(),
  spotId = 'spot-1',
  queryClient?: QueryClient,
) {
  return render(
    <TestProviders database={database} queryClient={queryClient}>
      <WriteReviewScreen navigation={navigation} route={{ params: { spotId } } as any} />
    </TestProviders>,
  )
}

beforeEach(() => jest.clearAllMocks())

it('writes the review straight to the local database and never touches the network', async () => {
  const database = createTestDatabase()
  const fetchSpy = jest.fn()
  global.fetch = fetchSpy as unknown as typeof fetch

  renderScreen(database)

  fireEvent.press(screen.getByLabelText('Rate 5 stars'))
  fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), 'Incredible view.')
  fireEvent.press(screen.getByText('Post review'))

  await waitFor(async () => {
    expect(await database.get<Review>('sto_reviews').query().fetchCount()).toBe(1)
  })

  expect(fetchSpy).not.toHaveBeenCalled()

  const [review] = await database.get<Review>('sto_reviews').query().fetch()
  expect(review.rating).toBe(5)
  expect(review.body).toBe('Incredible view.')
  expect(review.spotUuid).toBe('spot-1')
  expect(review.isQueued).toBe(true)
})

it('navigates back after saving', async () => {
  const database = createTestDatabase()

  renderScreen(database)

  fireEvent.press(screen.getByLabelText('Rate 4 stars'))
  fireEvent.press(screen.getByText('Post review'))

  await waitFor(() => {
    expect(navigation.goBack).toHaveBeenCalled()
  })
})

it('shows no loading spinner, because a local write cannot fail for network reasons', () => {
  renderScreen()

  expect(screen.queryByTestId('write-review-loading')).toBeNull()
})

it('requires a rating before it will save', async () => {
  const database = createTestDatabase()

  renderScreen(database)

  fireEvent.press(screen.getByText('Post review'))

  await waitFor(() => {
    expect(screen.getByText('Choose a rating before posting.')).toBeTruthy()
  })
  expect(await database.get<Review>('sto_reviews').query().fetchCount()).toBe(0)
})

/**
 * Artboard 4 of the Spot Hub design, "Write Review" (STOURIFY-293).
 */
describe('the Write Review artboard', () => {
  it('has the round back bar, and Back goes back', () => {
    renderScreen()

    expect(screen.getByText('Write a review')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Back'))
    expect(navigation.goBack).toHaveBeenCalled()
  })

  it('names the spot and where it is, from the spot already in hand', () => {
    renderScreen(
      createTestDatabase(),
      'spot-1',
      seededClient({ uuid: 'spot-1', title: 'Blue Cove', address: '1 Shore Road', media: [] }),
    )

    expect(screen.getByTestId('write-review-spot')).toBeTruthy()
    expect(screen.getByText('Blue Cove')).toBeTruthy()
    expect(screen.getByText('1 Shore Road')).toBeTruthy()
  })

  it('leaves the spot card out, rather than fetching, when the spot is not in hand', () => {
    // This screen exists to work with no signal (STOURIFY-209), so it never
    // asks the network for the spot. With nothing cached there is simply no card.
    renderScreen()

    expect(screen.queryByTestId('write-review-spot')).toBeNull()
    expect(screen.getByText('Post review')).toBeTruthy()
  })

  it('labels the rating and the review, and says the chosen rating in words', () => {
    renderScreen()

    expect(screen.getByText('Your rating')).toBeTruthy()
    expect(screen.getByText('Your review')).toBeTruthy()
    expect(screen.getByText('Tap to rate')).toBeTruthy()

    fireEvent.press(screen.getByLabelText('Rate 2 stars'))
    expect(screen.getByText('Fair')).toBeTruthy()

    fireEvent.press(screen.getByLabelText('Rate 5 stars'))
    expect(screen.getByText('Excellent')).toBeTruthy()
    expect(screen.queryByText('Tap to rate')).toBeNull()
  })

  it('marks the chosen stars as selected', () => {
    renderScreen()

    fireEvent.press(screen.getByLabelText('Rate 3 stars'))

    expect(screen.getByLabelText('Rate 3 stars').props.accessibilityState).toEqual({
      selected: true,
    })
    expect(screen.getByLabelText('Rate 4 stars').props.accessibilityState).toEqual({
      selected: false,
    })
  })

  it('tells the reader a review written with no signal is not lost', () => {
    // True because `createLocalReview` writes to the synced table.
    renderScreen()

    expect(screen.getByTestId('write-review-offline-note')).toBeTruthy()
    expect(
      screen.getByText(
        "No signal? Your review queues and posts automatically when you're back online.",
      ),
    ).toBeTruthy()
  })

  it('does not draw "Add photos": a review cannot hold a photo', () => {
    renderScreen()

    expect(screen.queryByText(/add photos/i)).toBeNull()
  })
})
