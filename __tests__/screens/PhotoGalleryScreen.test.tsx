import { AxiosError, type AxiosResponse } from 'axios'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import { QueryClient } from '@tanstack/react-query'
import PhotoGalleryScreen from '@/features/spots/screens/PhotoGalleryScreen'
import { palette, spacing } from '@/theme/tokens'
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
    uuid: 'spot-1',
    title: 'Blue Cove',
    slug: 'blue-cove',
    latitude: 6.1,
    longitude: 125.2,
    status: 'published',
    media: [
      { uuid: 'm1', url: 'https://cdn.test/photo1.jpg', thumb_url: null },
      { uuid: 'm2', url: 'https://cdn.test/photo2.jpg', thumb_url: 'https://cdn.test/t2.jpg' },
    ],
    ...overrides,
  }
}

function makePost(uuid: string, likes: number, mediaUuid: string, name: string) {
  return {
    uuid,
    caption: `caption of ${uuid}`,
    visibility: 'public',
    is_published: true,
    published_at: '2026-01-01T00:00:00Z',
    likes_count: likes,
    comments_count: 0,
    author: { uuid: `u-${uuid}`, name, username: null, avatar_url: null },
    media: [{ uuid: mediaUuid, url: `https://cdn.test/${mediaUuid}.jpg`, thumb_url: null }],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    can: {},
  }
}

function page(data: unknown[]) {
  return { data, links: {}, meta: { current_page: 1, last_page: 1, total: data.length } }
}

/** Newest first, as the server sends them without a sort. */
const RECENT = [
  makePost('p-new', 2, 'pm-new', 'Maya R.'),
  makePost('p-old', 40, 'pm-old', 'Diego L.'),
]
/** The same two posts, most liked first. */
const TOP = [RECENT[1], RECENT[0]]

function renderScreen(spotId = 'spot-1', queryClient?: QueryClient) {
  return render(
    <TestProviders database={createTestDatabase()} queryClient={queryClient}>
      <PhotoGalleryScreen navigation={navigation} route={{ params: { spotId } } as any} />
    </TestProviders>,
  )
}

/** The tiles' photo keys, top-left to bottom-right. */
function tileOrder(): string[] {
  return screen
    .getAllByTestId(/^gallery-tile-/)
    .map((node) => String(node.props.testID).replace('gallery-tile-', ''))
    .filter((key) => !key.startsWith('likes-'))
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getSpotPosts as jest.Mock).mockImplementation((_uuid: string, sort?: string) =>
    Promise.resolve(page(sort === 'likes_count' ? TOP : RECENT)),
  )
})

/** Flattens RN's array-of-styles into one object. */
function styleOf(element: { props: { style?: unknown } }): Record<string, unknown> {
  const flatten = (input: unknown): Record<string, unknown> =>
    Array.isArray(input)
      ? Object.assign({}, ...input.map(flatten))
      : ((input ?? {}) as Record<string, unknown>)
  return flatten(element.props.style)
}

/**
 * Artboard 2 of the Spot Hub design, "Spot Photo Gallery" (STOURIFY-293).
 */
describe('the gallery grid', () => {
  it('shows the spot’s own photos first, then the photos people posted here', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

    renderScreen()

    await waitFor(() => expect(tileOrder()).toEqual(['m1', 'm2', 'pm-new', 'pm-old']))

    // A skeleton left mounted under content keeps announcing "Loading".
    expect(screen.queryByTestId('gallery-loading')).toBeNull()
    expect(screen.queryByTestId('gallery-error')).toBeNull()
    expect(screen.queryByText('No photos yet')).toBeNull()
  })

  it('asks for the posts exactly as the spot page does, so the two share one answer', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

    renderScreen()

    await waitFor(() => expect(getSpotPosts).toHaveBeenCalled())
    expect(getSpotPosts).toHaveBeenCalledWith('spot-1')
  })

  it('counts the photos in the title and names the spot under it', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

    renderScreen()

    await waitFor(() => expect(screen.getByText('Photos · 4')).toBeTruthy())
    expect(screen.getByTestId('gallery-header-subtitle')).toBeTruthy()
    expect(screen.getByText('Blue Cove')).toBeTruthy()
  })

  it('shows a post photo’s like count on its tile', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

    renderScreen()

    await waitFor(() => expect(screen.getByTestId('gallery-tile-likes-pm-old')).toBeTruthy())
    expect(within(screen.getByTestId('gallery-tile-likes-pm-old')).getByText('40')).toBeTruthy()
    // The spot's own photos have no likes to show.
    expect(screen.queryByTestId('gallery-tile-likes-m1')).toBeNull()
  })

  it('goes back when the back button is pressed', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

    renderScreen()

    await waitFor(() => expect(screen.getByLabelText('Back')).toBeTruthy())
    fireEvent.press(screen.getByLabelText('Back'))

    expect(navigation.goBack).toHaveBeenCalled()
  })

  it('uses the theme surface behind the grid', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

    renderScreen()

    await waitFor(() => expect(tileOrder().length).toBe(4))
    expect(styleOf(screen.getByTestId('gallery-root')).backgroundColor).toBe(palette.light.surface)
  })
})

describe('Most recent and Top rated', () => {
  it('opens on Most recent', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

    renderScreen()

    await waitFor(() => expect(screen.getByLabelText('Most recent')).toBeTruthy())
    expect(screen.getByLabelText('Most recent').props.accessibilityState).toEqual({
      selected: true,
    })
  })

  it('asks the server for the most liked posts, and puts them first', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

    renderScreen()

    await waitFor(() => expect(tileOrder()).toEqual(['m1', 'm2', 'pm-new', 'pm-old']))
    fireEvent.press(screen.getByLabelText('Top rated'))

    await waitFor(() => expect(getSpotPosts).toHaveBeenCalledWith('spot-1', 'likes_count'))
    // The spot's own photos have no likes, so they rank last.
    await waitFor(() => expect(tileOrder()).toEqual(['pm-old', 'pm-new', 'm1', 'm2']))
  })
})

describe('the lightbox', () => {
  it('opens a post photo full screen, with who posted it and a way to the post', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

    renderScreen()

    await waitFor(() => expect(screen.getByTestId('gallery-tile-pm-old')).toBeTruthy())
    fireEvent.press(screen.getByTestId('gallery-tile-pm-old'))

    const lightbox = screen.getByTestId('gallery-lightbox')
    expect(within(lightbox).getByText('Community photo')).toBeTruthy()
    expect(within(lightbox).getByText('Diego L.')).toBeTruthy()
    expect(within(lightbox).getByText('caption of p-old')).toBeTruthy()
    expect(within(lightbox).getByText('4 / 4')).toBeTruthy()

    fireEvent.press(within(lightbox).getByText('Open post'))

    expect(navigation.navigate).toHaveBeenCalledWith('PostDetail', { postId: 'p-old' })
  })

  it('opens one of the spot’s own photos with no post to open', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

    renderScreen()

    await waitFor(() => expect(screen.getByTestId('gallery-tile-m1')).toBeTruthy())
    fireEvent.press(screen.getByTestId('gallery-tile-m1'))

    const lightbox = screen.getByTestId('gallery-lightbox')
    expect(within(lightbox).getByText('Spot photo')).toBeTruthy()
    expect(within(lightbox).getByText('1 / 4')).toBeTruthy()
    expect(within(lightbox).queryByText('Open post')).toBeNull()
  })

  it('draws every photo, so it can be swiped from one to the next', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

    renderScreen()

    await waitFor(() => expect(screen.getByTestId('gallery-tile-m1')).toBeTruthy())
    fireEvent.press(screen.getByTestId('gallery-tile-m1'))

    for (const index of [0, 1, 2, 3]) {
      expect(screen.getByTestId(`gallery-photo-${index}`)).toBeTruthy()
    }
  })

  it('closes with its round close button and leaves the grid where it was', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

    renderScreen()

    await waitFor(() => expect(screen.getByTestId('gallery-tile-m2')).toBeTruthy())
    fireEvent.press(screen.getByTestId('gallery-tile-m2'))
    expect(screen.getByTestId('gallery-lightbox')).toBeTruthy()

    fireEvent.press(screen.getByLabelText('Close'))

    expect(screen.queryByTestId('gallery-lightbox')).toBeNull()
    expect(screen.getByTestId('gallery-tile-m2')).toBeTruthy()
    expect(navigation.goBack).not.toHaveBeenCalled()
  })

  /**
   * The lightbox covers the whole screen, status bar included, so its top row
   * has to clear the status bar itself — the same trap STOURIFY-255 found on
   * the old gallery header. `TestProviders` fixes the top inset at 47.
   */
  it('keeps its close button below the status bar', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

    renderScreen()

    await waitFor(() => expect(screen.getByTestId('gallery-tile-m1')).toBeTruthy())
    fireEvent.press(screen.getByTestId('gallery-tile-m1'))

    expect(styleOf(screen.getByTestId('gallery-lightbox-top')).paddingTop).toBe(47 + spacing[3])
  })
})

/**
 * The four states, and the order is the fix (STOURIFY-89): "did it come back
 * broken?" and "has it come back at all?" before "are there photos?".
 */
describe('before there is anything to show', () => {
  it('says there are no photos only once both the spot and its posts have answered', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot({ media: [] }))
    ;(getSpotPosts as jest.Mock).mockResolvedValue(page([]))

    renderScreen()

    await waitFor(() => expect(screen.getByText('No photos yet')).toBeTruthy())

    expect(screen.queryByText("Couldn't load the photos")).toBeNull()
    expect(screen.queryByTestId('gallery-error')).toBeNull()
    expect(screen.queryByTestId('gallery-loading')).toBeNull()
    expect(screen.queryAllByTestId(/^gallery-tile-/)).toHaveLength(0)
  })

  it('shows a loading treatment, and says nothing about photos, while the spot is in flight', async () => {
    ;(getSpot as jest.Mock).mockReturnValue(new Promise(() => {}))

    renderScreen()

    await waitFor(() => expect(screen.getByTestId('gallery-loading')).toBeTruthy())
    expect(screen.queryByText('No photos yet')).toBeNull()
    expect(screen.queryByText("Couldn't load the photos")).toBeNull()
    expect(screen.queryAllByTestId(/^gallery-tile-/)).toHaveLength(0)
  })

  it('does not say "no photos" while the posts are still in flight', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot({ media: [] }))
    ;(getSpotPosts as jest.Mock).mockReturnValue(new Promise(() => {}))

    renderScreen()

    await waitFor(() => expect(screen.getByTestId('gallery-loading')).toBeTruthy())
    expect(screen.queryByText('No photos yet')).toBeNull()
  })

  it('says the request failed, and offers a retry, when the spot cannot be fetched', async () => {
    ;(getSpot as jest.Mock).mockRejectedValue(new Error('offline'))
    ;(getSpotPosts as jest.Mock).mockResolvedValue(page([]))

    renderScreen()

    await waitFor(() => expect(screen.getByTestId('gallery-error')).toBeTruthy())
    expect(screen.getByText("Couldn't load the photos")).toBeTruthy()
    expect(screen.getByText('Try again')).toBeTruthy()

    expect(screen.queryByTestId('gallery-loading')).toBeNull()
    expect(screen.queryByText('No photos yet')).toBeNull()
    expect(screen.queryAllByLabelText('Loading')).toHaveLength(0)
  })

  it('re-runs the spot request when Try again is pressed', async () => {
    ;(getSpot as jest.Mock).mockRejectedValue(new Error('offline'))
    ;(getSpotPosts as jest.Mock).mockResolvedValue(page([]))

    renderScreen()

    await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy())
    expect(getSpot).toHaveBeenCalledTimes(1)

    fireEvent.press(screen.getByText('Try again'))

    await waitFor(() => expect((getSpot as jest.Mock).mock.calls.length).toBeGreaterThan(1))
  })

  it('keeps showing photos it already has while the refetch is failing', async () => {
    // Offline, on a spot opened yesterday: the reader keeps the photos.
    const queryClient = trackQueryClient(
      new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
    )
    queryClient.setQueryData(['spot', 'spot-1'], makeSpot())

    ;(getSpot as jest.Mock).mockRejectedValue(new Error('offline'))
    ;(getSpotPosts as jest.Mock).mockRejectedValue(new Error('offline'))

    renderScreen('spot-1', queryClient)

    await waitFor(() => expect(getSpot).toHaveBeenCalled())

    expect(screen.getByTestId('gallery-tile-m1')).toBeTruthy()
    expect(screen.queryByTestId('gallery-error')).toBeNull()
    expect(screen.queryByText("Couldn't load the photos")).toBeNull()
    expect(screen.queryByText('No photos yet')).toBeNull()
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
    ;(getSpot as jest.Mock).mockRejectedValue(forbidden())
    ;(getSpotPosts as jest.Mock).mockResolvedValue(page([]))
    renderScreen()

    await waitFor(() => expect(screen.getByTestId('gallery-error')).toBeTruthy())

    expect(screen.getByText("Couldn't load the photos")).toBeTruthy()
    expect(screen.queryByText(/check your connection/i)).toBeNull()
    expect(screen.getByText(/isn't allowed/i)).toBeTruthy()
  })

  it('still blames the connection when there really was no answer', async () => {
    ;(getSpot as jest.Mock).mockRejectedValue(
      new AxiosError('Network Error', AxiosError.ERR_NETWORK, { headers: {} } as never, {}),
    )
    ;(getSpotPosts as jest.Mock).mockResolvedValue(page([]))
    renderScreen()

    await waitFor(() => expect(screen.getByTestId('gallery-error')).toBeTruthy())

    expect(screen.getByText(/check your connection/i)).toBeTruthy()
  })
})
