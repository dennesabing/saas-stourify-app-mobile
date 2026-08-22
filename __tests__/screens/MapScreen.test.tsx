import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient } from '@tanstack/react-query'
import MapScreen from '@/features/discover/screens/MapScreen'
import { EXPLORE_SPOTS_QUERY_KEY } from '@/features/discover/api/exploreSpots'
import { DEFAULT_MAP_CENTER } from '@/shared/map'
import type { Spot } from '@/shared/api/types'
import { createTestDatabase, seedCity, seedExplorerProfile } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

/**
 * The map vendor is mocked, exactly as `NearbyScreen.test.tsx` mocks it: the
 * real thing is a Google native view jest cannot draw, and whether it draws is
 * the emulator gate's question, not this file's. Here the fake map is a probe —
 * where did the screen point it, and which pins did it hand over?
 *
 * `mapProps` records every render's props so a test can read the *last* region,
 * which is the one on screen after the centre has been resolved.
 */
const mapProps: any[] = []

jest.mock('react-native-maps', () => {
  const React = require('react')
  const { View } = require('react-native')

  const MapView = (props: any) => {
    mapProps.push(props)
    return React.createElement(View, { testID: 'vendor-map-view' }, props.children)
  }

  // `onPress` is forwarded so a pin tap is testable off the device: selection is
  // behaviour the screen owns, and a marker that swallowed the tap would put it
  // out of reach of every test.
  const Marker = (props: any) =>
    React.createElement(View, { testID: `map-marker-${props.identifier}`, onPress: props.onPress })

  return { __esModule: true, default: MapView, Marker }
})

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
}))

jest.mock('@/shared/api/spots', () => ({
  getSpots: jest.fn(),
}))

import * as Location from 'expo-location'
import { getSpots } from '@/shared/api/spots'
import { trackQueryClient } from '../support/queryClients'

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const route = {} as any

const CEBU = { latitude: 10.3157, longitude: 123.8854 }

function makeSpot(overrides: Partial<Spot> = {}): Spot {
  return {
    id: '1',
    uuid: 'spot-1',
    title: 'Kalaklan Lighthouse',
    slug: 'kalaklan-lighthouse',
    latitude: 6.12,
    longitude: 125.17,
    status: 'active',
    categories: ['Heritage'],
    media: [
      { uuid: 'media-1', url: 'https://cdn.test/original.jpg', thumb_url: 'https://cdn.test/thumb.jpg' },
    ],
    rating_average: 4.5,
    reviews_count: 12,
    ...overrides,
  } as Spot
}

function page(spots: Spot[]) {
  return { data: spots, links: {}, meta: { current_page: 1, last_page: 1, total: spots.length } }
}

function renderScreen(options: { queryClient?: QueryClient; database?: any } = {}) {
  const database = options.database ?? createTestDatabase()

  return render(
    <TestProviders database={database} queryClient={options.queryClient}>
      <MapScreen navigation={navigation} route={route} />
    </TestProviders>,
  )
}

/** The region the fake map was last handed. */
function lastRegion() {
  return mapProps.at(-1)!.region
}

beforeEach(() => {
  jest.clearAllMocks()
  mapProps.length = 0
  ;(getSpots as jest.Mock).mockResolvedValue(page([makeSpot()]))
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' })
  ;(Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue(null)
  ;(Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue(null)
})

it('draws a pin for every spot in the shared explore query', async () => {
  ;(getSpots as jest.Mock).mockResolvedValue(
    page([makeSpot(), makeSpot({ id: '2', uuid: 'spot-2', title: 'Sarangani Bay' })]),
  )

  renderScreen()

  await waitFor(() => expect(screen.getByTestId('map-marker-spot-1')).toBeTruthy(), { timeout: 3000 })
  expect(screen.getByTestId('map-marker-spot-2')).toBeTruthy()
  expect(getSpots).toHaveBeenCalled()
})

/**
 * The whole point of a browse map. Nearby refuses to draw one at all without a
 * fix — "Can't pin down your location" — which is right for a screen answering
 * "what is near *me*" and wrong for one answering "what is around *here*". A map
 * that shows nothing until GPS agrees is not a browse map, so this asserts the
 * map is mounted on the flat refusal.
 */
it('still mounts a map when the device refuses to say where it is', async () => {
  renderScreen()

  await waitFor(() => expect(screen.getByTestId('vendor-map-view')).toBeTruthy(), { timeout: 3000 })
  expect(screen.queryByText("Can't pin down your location")).toBeNull()
})

/**
 * With no fix, the closest thing the app already knows is the explorer's home
 * city — and it knows it from the local database, so this works with the radio
 * off, which is the situation it exists for.
 */
it('opens on the home city when there is no device position', async () => {
  const database = createTestDatabase()
  await seedCity(database, { serverId: 7, name: 'Cebu', slug: 'cebu', ...CEBU })
  await seedExplorerProfile(database, { homeCityId: 7 })

  renderScreen({ database })

  await waitFor(() => expect(lastRegion().latitude).toBeCloseTo(CEBU.latitude, 3), { timeout: 3000 })
  expect(lastRegion().longitude).toBeCloseTo(CEBU.longitude, 3)
})

it('falls back to the seeded default when there is no home city either', async () => {
  renderScreen()

  await waitFor(() => expect(lastRegion().latitude).toBeCloseTo(DEFAULT_MAP_CENTER.latitude, 3), {
    timeout: 3000,
  })
})

it('opens on the device position when there is one', async () => {
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' })
  ;(Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
    coords: { latitude: 14.5995, longitude: 120.9842, accuracy: 10 },
  })

  renderScreen()

  await waitFor(() => expect(lastRegion().latitude).toBeCloseTo(14.5995, 3), { timeout: 3000 })
  expect(lastRegion().longitude).toBeCloseTo(120.9842, 3)
})

it('floats a peek card for the pin that was tapped, and opens that spot', async () => {
  renderScreen()

  await waitFor(() => expect(screen.getByTestId('map-marker-spot-1')).toBeTruthy(), { timeout: 3000 })
  expect(screen.queryByTestId('map-peek-card')).toBeNull()

  fireEvent.press(screen.getByTestId('map-marker-spot-1'))

  expect(screen.getByTestId('map-peek-card')).toBeTruthy()
  fireEvent.press(screen.getByText('Kalaklan Lighthouse'))
  expect(navigation.navigate).toHaveBeenCalledWith('SpotDetail', { spotId: 'spot-1' })
})

/**
 * A peek card draws the same small photo a grid cell does. `thumbFor()` owns
 * that rule; asserting the source here is what stops the peek card quietly
 * becoming the one place the app still downloads multi-megabyte originals.
 */
it('draws the peek card from the thumbnail', async () => {
  renderScreen()

  await waitFor(() => expect(screen.getByTestId('map-marker-spot-1')).toBeTruthy(), { timeout: 3000 })
  fireEvent.press(screen.getByTestId('map-marker-spot-1'))

  const image = screen.getAllByTestId('spot-card-image')[0]
  expect(image.props.source).toEqual([{ uri: 'https://cdn.test/thumb.jpg' }])
})

it('clears the selection when the map is recentred', async () => {
  renderScreen()

  await waitFor(() => expect(screen.getByTestId('map-marker-spot-1')).toBeTruthy(), { timeout: 3000 })
  fireEvent.press(screen.getByTestId('map-marker-spot-1'))
  expect(screen.getByTestId('map-peek-card')).toBeTruthy()

  fireEvent.press(screen.getByTestId('map-recenter'))

  expect(screen.queryByTestId('map-peek-card')).toBeNull()
})

/**
 * The map reads the grid's query, under the grid's key, so a page already saved
 * to disk draws pins with no network at all. Sharing the key is the whole of
 * that behaviour: a key that differed by one character would not fail, it would
 * just quietly never find the saved page.
 */
it('draws pins from the cached explore page when the network refuses', async () => {
  const queryClient = trackQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }))
  queryClient.setQueryData(EXPLORE_SPOTS_QUERY_KEY, [makeSpot({ uuid: 'cached-spot' })])
  ;(getSpots as jest.Mock).mockRejectedValue(new Error('Network request failed'))

  renderScreen({ queryClient })

  await waitFor(() => expect(getSpots).toHaveBeenCalled(), { timeout: 3000 })
  expect(screen.getByTestId('map-marker-cached-spot')).toBeTruthy()
})
