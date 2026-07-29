import { render, screen, waitFor } from '@testing-library/react-native'
import ReviewsScreen from '@/features/reviews/screens/ReviewsScreen'
import { createLocalReview } from '@/features/reviews/api/createLocalReview'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/reviews', () => ({
  getSpotReviews: jest.fn(),
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
  const bodies = screen.getAllByText(/Fresh local write\.|Stunning sunrise\./).map((n) => n.props.children)
  expect(bodies[0]).toBe('Fresh local write.')
})

it('shows an empty state when there are no reviews at all', async () => {
  ;(getSpotReviews as jest.Mock).mockResolvedValue({ data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } })

  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('No reviews yet')).toBeTruthy()
  })
})
