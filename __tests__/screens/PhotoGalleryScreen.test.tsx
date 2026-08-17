import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient } from '@tanstack/react-query'
import PhotoGalleryScreen from '@/features/spots/screens/PhotoGalleryScreen'
import { palette } from '@/theme/tokens'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/shared/api/spots', () => ({
  getSpot: jest.fn(),
}))

import { getSpot } from '@/shared/api/spots'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any

function makeSpot(overrides: Partial<any> = {}) {
  return {
    id: 's1',
    uuid: 'spot-1',
    title: 'Blue Cove',
    slug: 'blue-cove',
    latitude: 6.1,
    longitude: 125.2,
    status: 'active',
    media: [
      { uuid: 'm1', url: 'https://cdn.test/photo1.jpg', thumb_url: null },
      { uuid: 'm2', url: 'https://cdn.test/photo2.jpg', thumb_url: null },
      { uuid: 'm3', url: 'https://cdn.test/photo3.jpg', thumb_url: null },
    ],
    ...overrides,
  }
}

function renderScreen(spotId = 'spot-1', queryClient?: QueryClient) {
  return render(
    <TestProviders database={createTestDatabase()} queryClient={queryClient}>
      <PhotoGalleryScreen navigation={navigation} route={{ params: { spotId } } as any} />
    </TestProviders>,
  )
}

beforeEach(() => jest.clearAllMocks())

it('renders every photo full-bleed and a counter', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

  renderScreen()

  await waitFor(() => {
    expect(screen.getByTestId('gallery-photo-0')).toBeTruthy()
    expect(screen.getByTestId('gallery-photo-1')).toBeTruthy()
    expect(screen.getByTestId('gallery-photo-2')).toBeTruthy()
    expect(screen.getByText('1 / 3')).toBeTruthy()
  })

  // The two placeholders must be gone once real photos are on screen. A
  // skeleton left mounted under content is invisible in a screenshot and
  // permanent to a screen reader, which keeps announcing "Loading" over a
  // gallery that finished arriving.
  expect(screen.queryByTestId('gallery-loading')).toBeNull()
  expect(screen.queryByTestId('gallery-error')).toBeNull()
  expect(screen.queryByText('No photos yet')).toBeNull()
})

it('goes back when the back affordance is pressed', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

  renderScreen()

  await waitFor(() => expect(screen.getByLabelText('Back')).toBeTruthy())
  fireEvent.press(screen.getByLabelText('Back'))

  expect(navigation.goBack).toHaveBeenCalled()
})

it('shows an empty state when the spot has no photos', async () => {
  ;(getSpot as jest.Mock).mockResolvedValue(makeSpot({ media: [] }))

  renderScreen()

  await waitFor(() => {
    expect(screen.getByText('No photos yet')).toBeTruthy()
  })

  // "This spot has no photos" is a claim about the spot, and it is only true
  // once the spot has actually arrived. The absences are what stop this branch
  // quietly absorbing the other two again.
  expect(screen.queryByText("Couldn't load the photos")).toBeNull()
  expect(screen.queryByTestId('gallery-error')).toBeNull()
  expect(screen.queryByTestId('gallery-loading')).toBeNull()
  expect(screen.queryByTestId('gallery-photo-0')).toBeNull()
})

it('shows a loading treatment, and says nothing about photos, while the spot request is in flight', async () => {
  // A promise that never settles holds the screen in the state a slow network
  // puts it in, for as long as the test cares to look at it.
  ;(getSpot as jest.Mock).mockReturnValue(new Promise(() => {}))

  renderScreen()

  await waitFor(() => expect(screen.getByTestId('gallery-loading')).toBeTruthy())

  // This is the actual bug, in its quietest form. Before STOURIFY-89 a request
  // still in flight rendered "No photos yet" — a verdict on a spot nobody had
  // heard back about. Asserting only that a placeholder appeared would pass
  // against a screen that rendered both of them stacked.
  expect(screen.queryByText('No photos yet')).toBeNull()
  expect(screen.queryByText("Couldn't load the photos")).toBeNull()
  expect(screen.queryByTestId('gallery-photo-0')).toBeNull()
})

it('says the request failed, and offers a retry, when the spot cannot be fetched', async () => {
  ;(getSpot as jest.Mock).mockRejectedValue(new Error('offline'))

  renderScreen()

  await waitFor(() => expect(screen.getByTestId('gallery-error')).toBeTruthy())
  expect(screen.getByText("Couldn't load the photos")).toBeTruthy()
  expect(screen.getByText('Try again')).toBeTruthy()

  // Each absence names one of the states this one must not be confused with:
  // still waiting, loaded with photos, loaded with none. "No photos yet" is the
  // sentence the card is named after — it is a statement about the place, and
  // what went wrong was the network.
  expect(screen.queryByTestId('gallery-loading')).toBeNull()
  expect(screen.queryByTestId('gallery-photo-0')).toBeNull()
  expect(screen.queryByText('No photos yet')).toBeNull()

  // And nothing anywhere is still pulsing. `Skeleton` renders with the
  // accessibility label "Loading", so a stuck one keeps announcing a request
  // that finished — badly — some time ago.
  expect(screen.queryAllByLabelText('Loading')).toHaveLength(0)
})

it('re-runs the spot request when Try again is pressed', async () => {
  ;(getSpot as jest.Mock).mockRejectedValue(new Error('offline'))

  renderScreen()

  await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy())
  expect(getSpot).toHaveBeenCalledTimes(1)

  fireEvent.press(screen.getByText('Try again'))

  // Copy without a working button is a nicer dead end, not a way out.
  await waitFor(() => expect((getSpot as jest.Mock).mock.calls.length).toBeGreaterThan(1))
})

it('keeps showing photos it already has while the refetch is failing', async () => {
  // The offline case, and the whole reason the failure branch is gated on
  // `!spot` rather than on `isError` alone. Yesterday's spot is in the cache,
  // today's network is gone: the reader should keep swiping the photos, not be
  // handed an apology for not having them.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  queryClient.setQueryData(['spot', 'spot-1'], makeSpot())

  ;(getSpot as jest.Mock).mockRejectedValue(new Error('offline'))

  renderScreen('spot-1', queryClient)

  await waitFor(() => expect(getSpot).toHaveBeenCalled())

  expect(screen.getByTestId('gallery-photo-0')).toBeTruthy()
  expect(screen.getByText('1 / 3')).toBeTruthy()
  expect(screen.queryByTestId('gallery-error')).toBeNull()
  expect(screen.queryByText("Couldn't load the photos")).toBeNull()
  expect(screen.queryByText('No photos yet')).toBeNull()
})

/**
 * The viewer used to paint itself with `theme.colors.ink` — the *text* colour,
 * which happens to be near-black. In a light-themed app that reads as a room
 * whose walls were painted with the ink from the sign on the door: dark for a
 * reason that has nothing to do with the room. Photos are drawn with
 * `contentFit="contain"`, so the bars beside a photo that is not the screen's
 * shape showed that near-black too (STOURIFY-102).
 */
describe('background', () => {
  /** Flattens RN's array-of-styles into one object. */
  function styleOf(element: { props: { style?: unknown } }): Record<string, unknown> {
    const flatten = (input: unknown): Record<string, unknown> =>
      Array.isArray(input) ? Object.assign({}, ...input.map(flatten)) : ((input ?? {}) as Record<string, unknown>)
    return flatten(element.props.style)
  }

  it('uses the theme surface behind the photos', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot())

    renderScreen()

    await waitFor(() => expect(screen.getByTestId('gallery-photo-0')).toBeTruthy())

    expect(styleOf(screen.getByTestId('gallery-root')).backgroundColor).toBe(palette.light.surface)
    expect(styleOf(screen.getByTestId('gallery-photo-0')).backgroundColor).toBe(palette.light.surface)
  })

  it('uses the same theme surface when there are no photos', async () => {
    ;(getSpot as jest.Mock).mockResolvedValue(makeSpot({ media: [] }))

    renderScreen()

    await waitFor(() => expect(screen.getByText('No photos yet')).toBeTruthy())

    expect(styleOf(screen.getByTestId('gallery-root')).backgroundColor).toBe(palette.light.surface)
  })
})
