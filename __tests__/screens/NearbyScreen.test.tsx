import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import { QueryClient } from '@tanstack/react-query'
import NearbyScreen from '@/features/nearby/screens/NearbyScreen'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

/**
 * The map vendor is mocked. Rendering the real `react-native-maps` means
 * rendering a Google native view, which jest cannot do — and which the
 * emulator gate covers anyway. Here the map is only ever a presence check:
 * did the screen get far enough to mount it?
 *
 * The mock deliberately does NOT claim the `nearby-map` testID: since
 * STOURIFY-7 the screen mounts `MapCanvas`, which carries that id itself, and
 * two elements answering to one id makes every `getByTestId` ambiguous.
 */
jest.mock('react-native-maps', () => {
  const React = require('react')
  const { View } = require('react-native')

  const MapView = (props: any) =>
    React.createElement(View, { testID: 'vendor-map-view' }, props.children)
  // `onPress` is forwarded: pin selection is behaviour the screen owns, so a
  // marker that swallowed the tap would make it untestable outside the device.
  const Marker = (props: any) =>
    React.createElement(View, { testID: `nearby-marker-${props.title}`, onPress: props.onPress })

  return { __esModule: true, default: MapView, Marker }
})

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
}))

jest.mock('@/shared/api/spots', () => ({
  getNearbySpots: jest.fn(),
}))

import * as Location from 'expo-location'
import { getNearbySpots } from '@/shared/api/spots'
import { trackQueryClient } from '../support/queryClients'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const route = {} as any

/** The copy that must appear ONLY when permission was actually refused. */
const PERMISSION_COPY = 'Location access needed'

/**
 * The strip's two no-rows sentences. They are held as constants and always
 * asserted in pairs — one present, the other absent — because a screen that
 * rendered both would satisfy either assertion on its own and is not a fix.
 */
const STRIP_EMPTY_COPY = 'No spots nearby'
const STRIP_FAILURE_COPY = "Couldn't load nearby spots"

function position(latitude: number, longitude: number) {
  return { coords: { latitude, longitude } }
}

/**
 * A seeded General Santos City cluster, all due north of the viewer, so the
 * only thing separating the spots is latitude and the expected order is
 * arithmetic rather than a guess: 0 km, ~1.1 km, ~2.6 km, ~5.3 km.
 */
const GENSAN = { latitude: 6.1164, longitude: 125.1716 }

function gensanSpot(uuid: string, title: string, latitude: number, distanceKm: number) {
  return {
    uuid,
    title,
    slug: uuid,
    latitude,
    longitude: GENSAN.longitude,
    status: 'published' as const,
    distance_km: distanceKm,
  }
}

const GENSAN_PAGE = {
  data: [
    gensanSpot('plaza', 'Plaza Heneral Santos', 6.1164, 0),
    gensanSpot('oval', 'Oval Plaza', 6.1264, 1.113),
    gensanSpot('port', 'Bula Fish Port', 6.14, 2.627),
    gensanSpot('lagao', 'Lagao Gymnasium', 6.1642, 5.322),
  ],
  links: {},
  meta: { current_page: 1, last_page: 1, total: 4 },
}

/** Puts the screen in `ready` at the GenSan viewer position. */
function grantLocationAtGenSan() {
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'granted',
  })
  ;(Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue(
    position(GENSAN.latitude, GENSAN.longitude),
  )
}

function renderScreen(queryClient?: QueryClient) {
  return render(
    <TestProviders database={createTestDatabase()} queryClient={queryClient}>
      <NearbyScreen navigation={navigation} route={route} />
    </TestProviders>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getNearbySpots as jest.Mock).mockResolvedValue({
    data: [],
    links: {},
    meta: { current_page: 1, last_page: 1, total: 0 },
  })
})

it('does not blame permissions when the position request fails', async () => {
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'granted',
  })
  ;(Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(new Error('no fix'))
  ;(Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(null)

  renderScreen()

  await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy())
  expect(screen.queryByText(PERMISSION_COPY)).toBeNull()
})

it('falls back to the last known position when the live fix fails', async () => {
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'granted',
  })
  ;(Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(new Error('no fix'))
  ;(Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(position(14.5995, 120.9842))

  renderScreen()

  await waitFor(() => expect(screen.getByTestId('nearby-map')).toBeTruthy())
  expect(screen.queryByText(PERMISSION_COPY)).toBeNull()
})

it('falls back when the live fix never settles at all', async () => {
  // The emulator failure this card exists for: the promise does not reject,
  // it simply never resolves, so nothing reaches a `.catch`.
  jest.useFakeTimers()
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'granted',
  })
  ;(Location.getCurrentPositionAsync as jest.Mock).mockReturnValue(new Promise(() => {}))
  ;(Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(position(14.5995, 120.9842))

  try {
    renderScreen()

    // Let the permission promise settle before the clock is moved.
    await act(async () => {})
    expect(screen.queryByTestId('nearby-map')).toBeNull()

    await act(async () => {
      jest.advanceTimersByTime(10_000)
    })

    await waitFor(() => expect(screen.getByTestId('nearby-map')).toBeTruthy())
  } finally {
    jest.useRealTimers()
  }
})

it('still reports a genuine permission denial', async () => {
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' })

  renderScreen()

  await waitFor(() => expect(screen.getByText(PERMISSION_COPY)).toBeTruthy())
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled()
  expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled()
})

it('retries the request in place without leaving the screen', async () => {
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'granted',
  })
  ;(Location.getCurrentPositionAsync as jest.Mock).mockRejectedValueOnce(new Error('no fix'))
  ;(Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValueOnce(null)

  renderScreen()

  await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy())

  ;(Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue(position(14.5995, 120.9842))

  fireEvent.press(screen.getByText('Try again'))

  await waitFor(() => expect(screen.getByTestId('nearby-map')).toBeTruthy())
})

describe('the spots it renders', () => {
  it('queries the spots endpoint with the viewer position and the selected radius', async () => {
    grantLocationAtGenSan()
    ;(getNearbySpots as jest.Mock).mockResolvedValue(GENSAN_PAGE)

    renderScreen()

    await waitFor(() =>
      expect(getNearbySpots).toHaveBeenCalledWith(GENSAN.latitude, GENSAN.longitude, 10),
    )
  })

  /**
   * The gate criterion, on the screen rather than in the client: the strip and
   * the pins must both follow the server's distance order. Asserting the whole
   * sequence matters — "four spots rendered" would pass under any permutation.
   */
  it('renders the GenSan cluster in the server distance order', async () => {
    grantLocationAtGenSan()
    ;(getNearbySpots as jest.Mock).mockResolvedValue(GENSAN_PAGE)

    renderScreen()

    await waitFor(() => expect(screen.getByText('Plaza Heneral Santos')).toBeTruthy())

    const titles = ['Plaza Heneral Santos', 'Oval Plaza', 'Bula Fish Port', 'Lagao Gymnasium']

    // The strip: one `SpotCard` accessibility label per spot, in render order.
    const rendered = screen
      .getAllByLabelText(/^(Plaza Heneral Santos|Oval Plaza|Bula Fish Port|Lagao Gymnasium)$/)
      .map((node) => node.props.accessibilityLabel)
    expect(rendered).toEqual(titles)

    // The map: a marker per spot, plus the viewer's own pin.
    titles.forEach((title) => expect(screen.getByTestId(`nearby-marker-${title}`)).toBeTruthy())
    expect(screen.getByTestId('nearby-marker-You')).toBeTruthy()
  })

  it('shows each spot how far away it is', async () => {
    grantLocationAtGenSan()
    ;(getNearbySpots as jest.Mock).mockResolvedValue(GENSAN_PAGE)

    renderScreen()

    await waitFor(() => expect(screen.getByText('5.3 km away')).toBeTruthy())
    expect(screen.getByText('1.1 km away')).toBeTruthy()
  })

  /** Selecting a pin peeks the spot it belongs to, not whichever came first. */
  it('opens the spot behind the pin that was tapped', async () => {
    grantLocationAtGenSan()
    ;(getNearbySpots as jest.Mock).mockResolvedValue(GENSAN_PAGE)

    renderScreen()

    await waitFor(() => expect(screen.getByTestId('nearby-marker-Bula Fish Port')).toBeTruthy())

    fireEvent.press(screen.getByTestId('nearby-marker-Bula Fish Port'))

    const peek = await waitFor(() => screen.getByTestId('map-peek-card'))
    fireEvent.press(within(peek).getByLabelText('Bula Fish Port'))

    expect(navigation.navigate).toHaveBeenCalledWith('SpotDetail', { spotId: 'port' })
  })

  /**
   * The card's bug (STOURIFY-66). The spots request is switched off until a
   * position exists, and React Query's `isLoading` means *pending AND
   * fetching* — so a query that has not started reads `false`, exactly like a
   * query that finished and found nothing. The strip then answers a question
   * nobody has finished asking.
   *
   * `grantLocationAtGenSan()` is deliberately not used: it hands the screen a
   * position immediately, and the state under test is the gap before one
   * arrives. Both position calls are held unresolved so the screen cannot
   * reach `ready` by any route.
   */
  it('says nothing at all while it is still working out where you are', async () => {
    // Fake timers, like the never-settles test above, and for the same reason:
    // `readPosition` races the position call against a real eight-second
    // timeout that is only cleared when the race settles. Held unresolved, that
    // timer outlives the test and keeps the node process alive after the suite
    // finishes — jest reports it as "did not exit one second after the test run
    // has completed". The clock is never advanced; it just must not be real.
    jest.useFakeTimers()
    ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    })
    ;(Location.getCurrentPositionAsync as jest.Mock).mockReturnValue(new Promise(() => {}))
    ;(Location.getLastKnownPositionAsync as jest.Mock).mockReturnValue(new Promise(() => {}))

    try {
      renderScreen()

      // Let the permission promise settle, so the screen is past the prompt and
      // genuinely waiting on the position rather than not started.
      await act(async () => {})

      expect(screen.queryByText(STRIP_EMPTY_COPY)).toBeNull()
      expect(screen.queryByText(STRIP_FAILURE_COPY)).toBeNull()
      // The assertion that makes this a test of *not asked* rather than of *said
      // nothing*: without it the same test passes against a screen that fetched
      // and hid the answer.
      expect(getNearbySpots).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('says so plainly when the radius holds no spots', async () => {
    grantLocationAtGenSan()

    renderScreen()

    await waitFor(() => expect(screen.getByText(STRIP_EMPTY_COPY)).toBeTruthy())
    expect(screen.queryByText(STRIP_FAILURE_COPY)).toBeNull()
  })

  /**
   * The card's bug, stated as a test. "No spots nearby" is a claim about the
   * area the viewer is standing in; a request that failed says nothing about
   * the area at all. Told the first, a reader walks somewhere else — which is
   * the one move that cannot help.
   */
  it('does not claim the area is empty when the request failed', async () => {
    grantLocationAtGenSan()
    ;(getNearbySpots as jest.Mock).mockRejectedValue(new Error('offline'))

    renderScreen()

    await waitFor(() => expect(screen.getByText(STRIP_FAILURE_COPY)).toBeTruthy())
    expect(screen.queryByText(STRIP_EMPTY_COPY)).toBeNull()
  })

  it('asks again when the failure row is tapped', async () => {
    grantLocationAtGenSan()
    ;(getNearbySpots as jest.Mock).mockRejectedValue(new Error('offline'))

    renderScreen()

    await waitFor(() => expect(screen.getByText(STRIP_FAILURE_COPY)).toBeTruthy())
    expect(getNearbySpots).toHaveBeenCalledTimes(1)

    fireEvent.press(screen.getByText(STRIP_FAILURE_COPY))

    await waitFor(() => expect(getNearbySpots).toHaveBeenCalledTimes(2))
  })

  /**
   * The rule this whole family of cards is built on: an error never covers
   * content the reader could already read.
   *
   * React Query keeps serving the spots it has while a refetch fails, so the
   * strip has rows and `ListEmptyComponent` is never reached. Hoisting the
   * `isError` check above the `FlatList` would throw those rows away — and
   * would never once show that it had, because the branch is unreachable while
   * the network is up. This test is what makes that mistake visible.
   *
   * The warm cache is staged the way the feed's persisted-cache test stages
   * one: a `QueryClient` handed the exact key the screen will ask for.
   */
  it('keeps showing the spots it already has when a refetch fails', async () => {
    grantLocationAtGenSan()

    // `gcTime` is deliberately NOT zero here, unlike `TestProviders`' default
    // client. The seeded entry has no observer between `setQueryData` and the
    // screen's first fetch, and a zero collection window throws it away in that
    // gap — the cache would be empty before the screen ever looked at it.
    const queryClient = trackQueryClient(
      new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } }),
    )
    queryClient.setQueryData(['nearby', GENSAN.latitude, GENSAN.longitude, 10], GENSAN_PAGE)
    ;(getNearbySpots as jest.Mock).mockRejectedValue(new Error('offline'))

    const view = renderScreen(queryClient)

    try {
      // The refetch fires on mount because the seeded entry is already stale.
      await waitFor(() => expect(getNearbySpots).toHaveBeenCalled())

      expect(screen.getByLabelText('Plaza Heneral Santos')).toBeTruthy()
      expect(screen.getByLabelText('Lagao Gymnasium')).toBeTruthy()
      expect(screen.queryByText(STRIP_FAILURE_COPY)).toBeNull()
      expect(screen.queryByText(STRIP_EMPTY_COPY)).toBeNull()
    } finally {
      // Unmount and empty the cache by hand. A non-zero `gcTime` schedules a
      // five-minute collection timer the moment the last observer goes away,
      // and that timer keeps the whole node process alive after the suite has
      // finished — jest reports it as "did not exit one second after the test
      // run has completed". `clear()` destroys the queries and their timers.
      view.unmount()
      queryClient.clear()
    }
  })
})

/**
 * STOURIFY-240 — a spot whose contributor hid its location arrives with no
 * `latitude` and no `longitude` at all (STOURIFY-185 omits the keys rather
 * than nulling them).
 *
 * `/spots/nearby` excludes such a spot for anyone but its owner, so in
 * ordinary use this list will not contain one. "In ordinary use" is not a
 * guarantee: the owner's own request DOES return it, and a pin built from a
 * coordinate that is not there is a pin at `(undefined, undefined)`.
 */
describe('a spot whose coordinates the server withheld', () => {
  const HIDDEN = {
    uuid: 'hidden',
    title: 'Hidden Cove',
    slug: 'hidden-cove',
    status: 'published' as const,
    distance_km: 0.4,
  }

  it('keeps its card in the strip and puts no pin on the map', async () => {
    grantLocationAtGenSan()
    ;(getNearbySpots as jest.Mock).mockResolvedValue({
      data: [gensanSpot('plaza', 'Plaza Heneral Santos', 6.1164, 0), HIDDEN],
      links: {},
      meta: { current_page: 1, last_page: 1, total: 2 },
    })

    renderScreen()

    // The spot is still a result. Dropping it from the list as well would be a
    // second withdrawal nobody asked for — the strip is a list of places, and
    // this is one.
    await waitFor(() => expect(screen.getByLabelText('Hidden Cove')).toBeTruthy())

    // …and the map shows only what it can honestly place.
    expect(screen.getByTestId('nearby-marker-Plaza Heneral Santos')).toBeTruthy()
    expect(screen.queryByTestId('nearby-marker-Hidden Cove')).toBeNull()
  })
})
