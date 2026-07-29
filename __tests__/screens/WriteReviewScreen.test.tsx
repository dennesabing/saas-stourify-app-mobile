import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import WriteReviewScreen from '@/features/reviews/screens/WriteReviewScreen'
import type Review from '@/db/models/Review'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function renderScreen(database = createTestDatabase(), spotId = 'spot-1') {
  return render(
    <TestProviders database={database}>
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
  fireEvent.changeText(screen.getByPlaceholderText('Share what made this spot worth the trip'), 'Incredible view.')
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
