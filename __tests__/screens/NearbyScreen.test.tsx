import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
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

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const route = {} as any

/** The copy that must appear ONLY when permission was actually refused. */
const PERMISSION_COPY = 'Location access needed'

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
    status: 'active' as const,
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
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' })
  ;(Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue(
    position(GENSAN.latitude, GENSAN.longitude),
  )
}

function renderScreen() {
  return render(
    <TestProviders database={createTestDatabase()}>
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
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' })
  ;(Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(new Error('no fix'))
  ;(Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(null)

  renderScreen()

  await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy())
  expect(screen.queryByText(PERMISSION_COPY)).toBeNull()
})

it('falls back to the last known position when the live fix fails', async () => {
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' })
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
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' })
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
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' })
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

  it('says so plainly when the radius holds no spots', async () => {
    grantLocationAtGenSan()

    renderScreen()

    await waitFor(() => expect(screen.getByText('No spots nearby')).toBeTruthy())
  })
})
