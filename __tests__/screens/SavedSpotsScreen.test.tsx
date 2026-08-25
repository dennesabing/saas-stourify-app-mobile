import { render, screen, waitFor, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SavedSpotsScreen from '@/features/spots/screens/SavedSpotsScreen'
import { getWishlist } from '@/shared/api/wishlist'
import { trackQueryClient } from '../support/queryClients'

jest.mock('@/shared/api/wishlist', () => ({
  WISHLIST_QUERY_KEY: ['wishlist'],
  getWishlist: jest.fn(),
}))

const mockGetWishlist = getWishlist as jest.MockedFunction<typeof getWishlist>
const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function renderScreen() {
  const qc = trackQueryClient(
    new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
  )

  return render(
    <QueryClientProvider client={qc}>
      <SavedSpotsScreen navigation={navigation} route={{} as any} />
    </QueryClientProvider>,
  )
}

function savedItem(overrides: Record<string, unknown> = {}) {
  return {
    uuid: 'wish-1',
    note: null,
    is_downloaded_offline: false,
    created_at: '2026-08-20T00:00:00+00:00',
    spot: {
      uuid: 'spot-1',
      title: 'Blue Cove',
      categories: ['Coast'],
      address: 'Sarangani',
      rating_average: 4.5,
      reviews_count: 12,
      media: [{ thumb_url: 'https://cdn.example/thumb.jpg' }],
    },
    ...overrides,
  } as any
}

beforeEach(() => {
  jest.clearAllMocks()
})

it('lists the spots the explorer has saved', async () => {
  mockGetWishlist.mockResolvedValue([savedItem()])
  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('Blue Cove')).toBeTruthy()
  })
})

it('opens the spot when a saved row is pressed', async () => {
  mockGetWishlist.mockResolvedValue([savedItem()])
  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  fireEvent.press(screen.getByLabelText('Blue Cove'))

  expect(navigation.navigate).toHaveBeenCalledWith('SpotDetail', { spotId: 'spot-1' })
})

it('invites the explorer to save something when they have saved nothing', async () => {
  mockGetWishlist.mockResolvedValue([])
  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('Nothing saved yet')).toBeTruthy()
  })
})

/**
 * The distinction this screen exists to keep straight. Telling someone "nothing
 * saved yet" when the request actually failed is a claim about THEIR data made
 * from a network error — and the reader's reasonable conclusion is that their
 * saves were lost.
 */
it('says the request failed rather than claiming nothing is saved', async () => {
  mockGetWishlist.mockRejectedValue(new Error('offline'))
  renderScreen()

  await waitFor(() => {
    expect(screen.getByText("Can't reach Stourify")).toBeTruthy()
  })

  expect(screen.queryByText('Nothing saved yet')).toBeNull()
})

/**
 * A saved row whose spot is gone still occupies a line. Dropping it silently
 * would shorten the list with no explanation, which reads as a save having
 * vanished.
 */
it('keeps a row for a saved spot that no longer exists', async () => {
  mockGetWishlist.mockResolvedValue([savedItem({ spot: undefined })])
  renderScreen()

  await waitFor(() => {
    expect(screen.getByTestId('saved-spot-missing')).toBeTruthy()
  })
})
