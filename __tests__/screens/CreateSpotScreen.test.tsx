import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { Database } from '@nozbe/watermelondb'
import CreateSpotScreen from '@/features/create/screens/CreateSpotScreen'
import MySpotsScreen from '@/features/spots/screens/MySpotsScreen'
import type PendingMedia from '@/db/models/PendingMedia'
import type Spot from '@/db/models/Spot'
import { createTestDatabase, markSynced } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/sync/scheduler', () => ({ syncNow: jest.fn(async () => undefined) }))

/**
 * Since STOURIFY-4 the screen captures its coordinates instead of asking for
 * them, so a screen test has to stand in for two pieces of hardware: the map
 * (a Google native view jest cannot render) and the position sensor.
 *
 * The map mock is a bare view. Whether it *draws* is the emulator gate's
 * question; what matters here is that the screen got far enough to mount one
 * and that publishing uses the coordinates it was given.
 */
jest.mock('react-native-maps', () => {
  const React = require('react')
  const { View } = require('react-native')

  const MapView = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ animateToRegion: jest.fn() }))
    return React.createElement(View, { testID: 'vendor-map' }, props.children)
  })
  const Marker = (props: any) =>
    React.createElement(View, { testID: `vendor-marker-${props.identifier}` })

  return { __esModule: true, default: MapView, Marker }
})

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 6.1164, longitude: 125.1716, accuracy: 8 },
    timestamp: 1,
  })),
  getLastKnownPositionAsync: jest.fn(async () => null),
}))

/** Online, so no offline notice muddies the assertions below. */
jest.mock('@/sync/seams/connectivity', () => ({
  netInfoConnectivity: { isOnline: () => true, subscribe: () => () => {} },
}))

jest.mock('expo-file-system', () => {
  const present = new Set<string>()

  class MockFile {
    uri: string
    size = 4096

    constructor(...uris: Array<string | { uri: string }>) {
      this.uri = uris.map((u) => (typeof u === 'string' ? u : u.uri)).join('/')
    }

    get exists(): boolean {
      return present.has(this.uri)
    }

    copy(destination: { uri: string }) {
      present.add(destination.uri)
    }

    delete() {
      present.delete(this.uri)
    }
  }

  class MockDirectory {
    uri: string

    constructor(...uris: Array<string | { uri: string }>) {
      this.uri = uris.map((u) => (typeof u === 'string' ? u : u.uri)).join('/')
    }

    create() {}
  }

  return {
    __esModule: true,
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: { uri: 'file:///document-dir' } },
  }
})

import { queueCapturedPhoto } from '@/features/media/api/draftMedia'

async function capture(database: Database, filename: string): Promise<void> {
  await queueCapturedPhoto(database, { uri: `content://camera/${filename}`, filename, mime: 'image/jpeg' })
}

/**
 * A publishable spot: a name, plus the position the mocked sensor supplies on
 * its own. Waiting for the coordinates to land is the whole difference from the
 * old version of this helper — nothing types them any more.
 */
async function fillValidSpot(name = 'Hidden Cove'): Promise<void> {
  fireEvent.changeText(screen.getByPlaceholderText('Spot name'), name)

  await waitFor(() => {
    expect(screen.getByTestId('picked-coordinates')).toBeTruthy()
  })
}

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const route = {} as any

beforeEach(() => {
  jest.clearAllMocks()
})

it('writes the spot straight to the local database and never to the network', async () => {
  const database = createTestDatabase()
  const fetchSpy = jest.fn()
  global.fetch = fetchSpy as unknown as typeof fetch

  render(
    <TestProviders database={database}>
      <CreateSpotScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await fillValidSpot('Hidden Cove')
  fireEvent.press(screen.getByText('Publish spot'))

  await waitFor(async () => {
    expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(1)
  })

  expect(fetchSpy).not.toHaveBeenCalled()

  const [spot] = await database.get<Spot>('sto_spots').query().fetch()
  expect(spot.title).toBe('Hidden Cove')
  expect(spot.latitude).toBeCloseTo(6.1164)
  expect(spot.status).toBe('draft')
  expect(spot.isQueued).toBe(true)
  expect(spot.uuid).toBe(spot.id)
})

it('navigates to My Spots after the local write', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <CreateSpotScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await fillValidSpot('Kalaklan Point')
  fireEvent.press(screen.getByText('Publish spot'))

  await waitFor(() => {
    expect(navigation.navigate).toHaveBeenCalledWith('MySpots')
  })
})

it('shows no loading spinner, because a local write cannot fail for network reasons', () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <CreateSpotScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  expect(screen.queryByTestId('create-spot-loading')).toBeNull()
})

it('validates locally without touching the database', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <CreateSpotScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  fireEvent.press(screen.getByText('Publish spot'))

  await waitFor(() => {
    expect(screen.getByText('A spot needs a name of at least 3 characters.')).toBeTruthy()
  })
  expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(0)
})

it('offers no way to type a coordinate — the card\'s first acceptance line', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <CreateSpotScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByTestId('picked-coordinates')).toBeTruthy()
  })

  expect(screen.queryByPlaceholderText('Latitude')).toBeNull()
  expect(screen.queryByPlaceholderText('Longitude')).toBeNull()
})

it('publishes the position the phone reported, without anybody typing it', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <CreateSpotScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await fillValidSpot('Sensor Sourced')
  fireEvent.press(screen.getByText('Publish spot'))

  await waitFor(async () => {
    expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(1)
  })

  const [spot] = await database.get<Spot>('sto_spots').query().fetch()
  expect(spot.latitude).toBeCloseTo(6.1164)
  expect(spot.longitude).toBeCloseTo(125.1716)
})

it('saves the categories that were picked, in the field name the server uses', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <CreateSpotScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await fillValidSpot('Categorised Cove')
  fireEvent.press(screen.getByText('Coast'))
  fireEvent.press(screen.getByText('Publish spot'))

  await waitFor(async () => {
    expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(1)
  })

  const [spot] = await database.get<Spot>('sto_spots').query().fetch()
  expect(spot.categories).toEqual(['Coast'])
})

// The reason this is worth a screen test rather than only a unit test: the row
// would otherwise sit in the outbox and be refused by the server minutes later,
// with nobody watching to be told.
it('refuses a description past the server\'s limit before writing anything', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <CreateSpotScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await fillValidSpot('Overlong Story')
  fireEvent.changeText(
    screen.getByPlaceholderText('What makes it worth the trip?'),
    'x'.repeat(5001),
  )
  fireEvent.press(screen.getByText('Publish spot'))

  await waitFor(() => {
    expect(screen.getByText(/5,000 characters/)).toBeTruthy()
  })

  expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(0)
})

it('shows the photo counter against the cap, and routes to capture', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <CreateSpotScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByText('0 of 3')).toBeTruthy()
  })

  fireEvent.press(screen.getByLabelText('Add photos'))
  expect(navigation.navigate).toHaveBeenCalledWith('CameraCapture')
})

it('shows the captured photos as they are queued', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <CreateSpotScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await capture(database, 'one.jpg')
  await capture(database, 'two.jpg')

  await waitFor(() => {
    expect(screen.getByText('2 of 3')).toBeTruthy()
    expect(screen.getByLabelText('one.jpg')).toBeTruthy()
    expect(screen.getByLabelText('two.jpg')).toBeTruthy()
  })
})

it('binds every captured photo to the published spot — the M4 gate, in one screen', async () => {
  const database = createTestDatabase()
  const fetchSpy = jest.fn()
  global.fetch = fetchSpy as unknown as typeof fetch

  for (const filename of ['one.jpg', 'two.jpg', 'three.jpg']) await capture(database, filename)

  render(
    <TestProviders database={database}>
      <CreateSpotScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByText('3 of 3')).toBeTruthy()
  })

  await fillValidSpot()
  fireEvent.press(screen.getByText('Publish spot'))

  await waitFor(() => {
    expect(navigation.navigate).toHaveBeenCalledWith('MySpots')
  })

  const [spot] = await database.get<Spot>('sto_spots').query().fetch()
  const media = await database.get<PendingMedia>('pending_media').query().fetch()

  expect(media).toHaveLength(3)
  for (const row of media) {
    expect(row.hostUuid).toBe(spot.uuid)
    expect(row.hostType).toBe('stourify_spot')
  }
  // Offline throughout: the bind is a local write, not a deferred upload.
  expect(fetchSpy).not.toHaveBeenCalled()
})

it('at the cap, the add-photos affordance is disabled rather than hidden', async () => {
  const database = createTestDatabase()
  for (const filename of ['one.jpg', 'two.jpg', 'three.jpg']) await capture(database, filename)

  render(
    <TestProviders database={database}>
      <CreateSpotScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByText('That is all 3 photos. Remove one to take another.')).toBeTruthy()
  })

  fireEvent.press(screen.getByLabelText('Add photos'))
  expect(navigation.navigate).not.toHaveBeenCalledWith('CameraCapture')
})

it('My Spots renders the queued affordance and drops it once the row is synced', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <MySpotsScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  const spot = await database.write(async () =>
    database.get<Spot>('sto_spots').create((row: any) => {
      row._raw.id = 'spot-observed'
      row._raw.uuid = 'spot-observed'
      row._raw.title = 'Observed Spot'
      row._raw.latitude = 1
      row._raw.longitude = 1
      row._raw.status = 'draft'
      row._raw.is_verified = false
      row._raw.reviews_count = 0
      row._raw.saves_count = 0
      row._raw.created_at = 1
      row._raw.updated_at = 1
    }),
  )

  await waitFor(() => {
    expect(screen.getByText('Observed Spot')).toBeTruthy()
    expect(screen.getByText('Queued ↑')).toBeTruthy()
  })

  await markSynced(database, spot)

  await waitFor(() => {
    expect(screen.queryByText('Queued ↑')).toBeNull()
  })
})

it('My Spots shows an empty state before anything is created', async () => {
  const database = createTestDatabase()

  render(
    <TestProviders database={database}>
      <MySpotsScreen navigation={navigation} route={route} />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByText('No spots yet')).toBeTruthy()
  })
})
