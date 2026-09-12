import { AxiosError, type AxiosResponse } from 'axios'
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
    expect(screen.getByText("Couldn't load your saved spots")).toBeTruthy()
  })

  expect(screen.queryByText('Nothing saved yet')).toBeNull()
  expect(screen.getByText('Try again')).toBeTruthy()
})

/**
 * STOURIFY-280, following STOURIFY-225 and -250. This panel was headed "Can't
 * reach Stourify" over "…try again once you have signal" for every failure,
 * including a refusal the server answered — so, as on Discover, the headline was
 * part of the wrong claim, and the refusal test forbids any wording about
 * reaching, connection or signal. The pair is the point: the first test alone
 * would pass if the connection wording were deleted everywhere, which would
 * break the one case where it is true.
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

  it('does not blame the connection at all when the server answered 403', async () => {
    mockGetWishlist.mockRejectedValue(forbidden())
    renderScreen()

    await waitFor(() => {
      expect(screen.getByText("Couldn't load your saved spots")).toBeTruthy()
    })
    expect(screen.queryByText(/can't reach|connection|signal/i)).toBeNull()
    expect(screen.getByText(/isn't allowed/i)).toBeTruthy()
  })

  it('still blames the connection when there really was no answer', async () => {
    mockGetWishlist.mockRejectedValue(
      new AxiosError('Network Error', AxiosError.ERR_NETWORK, { headers: {} } as never, {}),
    )
    renderScreen()

    await waitFor(() => {
      expect(screen.getByText("Couldn't load your saved spots")).toBeTruthy()
    })
    expect(screen.getByText(/check your connection/i)).toBeTruthy()
  })
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
