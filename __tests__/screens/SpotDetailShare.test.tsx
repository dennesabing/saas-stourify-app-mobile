import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Share } from 'react-native'
import SpotDetailScreen from '@/features/spots/screens/SpotDetailScreen'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/spots', () => ({
  getSpot: jest.fn(),
  getSpotPosts: jest.fn(),
}))

jest.mock('@/shared/api/spotAbouts', () => ({
  getSpotAbouts: jest.fn(),
  createSpotAbout: jest.fn(),
}))

jest.mock('@/shared/api/reviews', () => ({
  getSpotReviews: jest.fn(),
}))

import { getSpot, getSpotPosts } from '@/shared/api/spots'
import { getSpotAbouts } from '@/shared/api/spotAbouts'
import { getSpotReviews } from '@/shared/api/reviews'

/**
 * The spot page's Share button (STOURIFY-301).
 *
 * `stourify://spot/<uuid>` opens only on a phone that already has the app, so
 * the thing worth handing a friend is the spot's public web page — the link the
 * server sends as `share_url`. Two promises, one test each:
 *
 *   1. Share hands the phone's share sheet exactly that link, and puts it in
 *      `message` too, because Android's sheet sends only `message`.
 *   2. No `share_url`, no button. The server sends `null` for a spot with no
 *      public page, and a Share button that sends a friend to "this spot isn't
 *      public" is worse than none.
 */

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const SHARE_URL = 'https://stourify.com/s/spot-1'

function makeSpot(overrides: Partial<any> = {}) {
  return {
    uuid: 'spot-1',
    title: 'Blue Cove',
    slug: 'blue-cove',
    description: 'A quiet cove.',
    latitude: 6.1,
    longitude: 125.2,
    status: 'published',
    is_verified: false,
    categories: ['Nature'],
    media: [],
    rating_average: 0,
    reviews_count: 0,
    saves_count: 0,
    share_url: SHARE_URL,
    ...overrides,
  }
}

const emptyPage = { data: [], links: {}, meta: { current_page: 1, last_page: 1, total: 0 } }

function renderScreen() {
  return render(
    <TestProviders database={createTestDatabase()}>
      <SpotDetailScreen navigation={navigation} route={{ params: { spotId: 'spot-1' } } as any} />
    </TestProviders>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getSpotPosts as jest.Mock).mockResolvedValue(emptyPage)
  ;(getSpotAbouts as jest.Mock).mockResolvedValue(emptyPage)
  ;(getSpotReviews as jest.Mock).mockResolvedValue(emptyPage)
})

it('hands the share sheet the spot’s public web link and its name', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any)
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

  renderScreen()

  fireEvent.press(await screen.findByTestId('spot-share'))

  expect(share).toHaveBeenCalledTimes(1)
  const [content] = share.mock.calls[0]
  expect(content).toEqual({
    title: 'Blue Cove',
    message: `Blue Cove ${SHARE_URL}`,
    url: SHARE_URL,
  })
})

it('draws no Share button for a spot with no public page', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot({ share_url: null }))

  renderScreen()

  // Wait for the spot to arrive, so "no button" means the spot said so rather
  // than that the screen was still loading.
  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  expect(screen.queryByTestId('spot-share')).toBeNull()
})

it('draws no Share button when the server sends no share link at all', async () => {
  // A server older than STOURIFY-301 omits the key. Same answer as null.
  const { share_url: _omitted, ...spot } = makeSpot()
  ;(getSpot as jest.Mock).mockResolvedValue(spot)

  renderScreen()

  await waitFor(() => expect(screen.getByText('Blue Cove')).toBeTruthy())
  expect(screen.queryByTestId('spot-share')).toBeNull()
})
