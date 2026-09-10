import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { DeviceEventEmitter, View } from 'react-native'
import type { Database } from '@nozbe/watermelondb'
import CreateSpotScreen from '@/features/create/screens/CreateSpotScreen'
import MySpotsScreen from '@/features/spots/screens/MySpotsScreen'
import type Spot from '@/db/models/Spot'
import { createTestDatabase, markSynced } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

/**
 * The New Spot form — step one of three since STOURIFY-257. It checks the form
 * and hands it to Review; it never writes. The write, and the photo bind, are
 * `ReviewSpotScreen.test.tsx`'s to prove.
 *
 * The form captures its coordinates instead of asking for them (STOURIFY-4), so
 * the test stands in for the position sensor. It no longer mounts a map — that
 * lives on `SpotLocationScreen` now.
 */
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

    async bytes() {
      return new Uint8Array([1, 2, 3])
    }

    // `queueLocalMedia` reads, strips and writes rather than calling the native
    // `copy()`, so the photo's metadata never reaches the outbox (STOURIFY-40).
    write(_bytes: Uint8Array) {
      present.add(this.uri)
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

import * as Location from 'expo-location'
import { queueCapturedPhoto } from '@/features/media/api/draftMedia'

async function capture(database: Database, filename: string): Promise<void> {
  await queueCapturedPhoto(database, {
    uri: `content://camera/${filename}`,
    filename,
    mime: 'image/jpeg',
  })
}

const SENSOR = { latitude: 6.1164, longitude: 125.1716 }
const NEXT = 'Next · Review & Publish'

/**
 * A complete form: a name, plus the position the mocked sensor supplies on its
 * own. Waiting for the coordinates to land in the location row is the point —
 * nothing types them.
 */
async function fillValidSpot(name = 'Hidden Cove'): Promise<void> {
  fireEvent.changeText(screen.getByPlaceholderText('Spot name'), name)

  await waitFor(() => {
    expect(screen.getByTestId('picked-coordinates')).toBeTruthy()
  })
}

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any
const route = {} as any

function renderForm(database: Database, withRoute: any = route) {
  return render(
    <TestProviders database={database}>
      <CreateSpotScreen navigation={navigation} route={withRoute} />
    </TestProviders>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

it('hands a valid form to Review, with the position the phone reported, and writes nothing', async () => {
  const database = createTestDatabase()
  const fetchSpy = jest.fn()
  global.fetch = fetchSpy as unknown as typeof fetch

  renderForm(database)

  await fillValidSpot('Hidden Cove')
  fireEvent.press(screen.getByText(NEXT))

  expect(navigation.navigate).toHaveBeenCalledWith('ReviewSpot', {
    title: 'Hidden Cove',
    description: '',
    categories: [],
    coordinate: expect.objectContaining({
      latitude: expect.closeTo(SENSOR.latitude, 4),
      longitude: expect.closeTo(SENSOR.longitude, 4),
    }),
  })

  // The form is a form. Only Review writes.
  expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(0)
  expect(fetchSpy).not.toHaveBeenCalled()
})

it('validates locally, and stays on the form', async () => {
  const database = createTestDatabase()
  renderForm(database)

  fireEvent.press(screen.getByText(NEXT))

  await waitFor(() => {
    expect(screen.getByText('A spot needs a name of at least 3 characters.')).toBeTruthy()
  })
  expect(navigation.navigate).not.toHaveBeenCalledWith('ReviewSpot', expect.anything())
})

it('clears the error once the title is fixed (STOURIFY-257)', async () => {
  const database = createTestDatabase()
  renderForm(database)

  fireEvent.press(screen.getByText(NEXT))
  await waitFor(() => {
    expect(screen.getByText('A spot needs a name of at least 3 characters.')).toBeTruthy()
  })

  fireEvent.changeText(screen.getByPlaceholderText('Spot name'), 'Fixed Cove')

  expect(screen.queryByText('A spot needs a name of at least 3 characters.')).toBeNull()
})

it('clears the error when a category chip is pressed (STOURIFY-257)', async () => {
  const database = createTestDatabase()
  renderForm(database)

  fireEvent.press(screen.getByText(NEXT))
  await waitFor(() => {
    expect(screen.getByText('A spot needs a name of at least 3 characters.')).toBeTruthy()
  })

  fireEvent.press(screen.getByText('Coast'))

  expect(screen.queryByText('A spot needs a name of at least 3 characters.')).toBeNull()
})

it('shows the error again on the next Next press if the form is still invalid (STOURIFY-257)', async () => {
  const database = createTestDatabase()
  renderForm(database)

  fireEvent.press(screen.getByText(NEXT))
  await waitFor(() => {
    expect(screen.getByText('A spot needs a name of at least 3 characters.')).toBeTruthy()
  })

  // Still under three characters, so the same rule fires again.
  fireEvent.changeText(screen.getByPlaceholderText('Spot name'), 'Hi')
  expect(screen.queryByText('A spot needs a name of at least 3 characters.')).toBeNull()

  fireEvent.press(screen.getByText(NEXT))
  await waitFor(() => {
    expect(screen.getByText('A spot needs a name of at least 3 characters.')).toBeTruthy()
  })
})

it("offers no way to type a coordinate — STOURIFY-4's first acceptance line", async () => {
  const database = createTestDatabase()
  renderForm(database)

  await waitFor(() => {
    expect(screen.getByTestId('picked-coordinates')).toBeTruthy()
  })

  expect(screen.queryByPlaceholderText('Latitude')).toBeNull()
  expect(screen.queryByPlaceholderText('Longitude')).toBeNull()
})

it('says it is locating until the phone answers', () => {
  // A permission promise that never settles is the real shape of "still looking".
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockReturnValueOnce(
    new Promise(() => {}),
  )

  renderForm(createTestDatabase())

  expect(screen.getByText('Finding where you are…')).toBeTruthy()
})

it('opens the full-screen map from the location row, carrying the current pin', async () => {
  const database = createTestDatabase()
  renderForm(database)

  await waitFor(() => {
    expect(screen.getByTestId('picked-coordinates')).toBeTruthy()
  })

  fireEvent.press(screen.getByLabelText('Location'))

  expect(navigation.navigate).toHaveBeenCalledWith('SpotLocation', {
    coordinate: expect.objectContaining({ latitude: expect.closeTo(SENSOR.latitude, 4) }),
  })
})

it('takes the pin the location picker hands back, over the phone’s own fix', async () => {
  const database = createTestDatabase()
  const placed = { latitude: 7.25, longitude: 126.5 }

  renderForm(database, { params: { coordinate: placed } })

  await waitFor(() => {
    expect(screen.getByTestId('picked-coordinates').props.children).toBe('7.25000, 126.50000')
  })

  fireEvent.changeText(screen.getByPlaceholderText('Spot name'), 'Hand Placed')
  fireEvent.press(screen.getByText(NEXT))

  expect(navigation.navigate).toHaveBeenCalledWith(
    'ReviewSpot',
    expect.objectContaining({ coordinate: placed }),
  )
})

it('carries the categories that were picked', async () => {
  const database = createTestDatabase()
  renderForm(database)

  await fillValidSpot('Categorised Cove')
  fireEvent.press(screen.getByText('Coast'))
  fireEvent.press(screen.getByText(NEXT))

  expect(navigation.navigate).toHaveBeenCalledWith(
    'ReviewSpot',
    expect.objectContaining({ categories: ['Coast'] }),
  )
})

// The reason this is worth a screen test rather than only a unit test: the row
// would otherwise sit in the outbox and be refused by the server minutes later,
// with nobody watching to be told.
it("refuses a description past the server's limit before Review", async () => {
  const database = createTestDatabase()
  renderForm(database)

  await fillValidSpot('Overlong Story')
  fireEvent.changeText(
    screen.getByPlaceholderText('What makes it worth the trip?'),
    'x'.repeat(5001),
  )
  fireEvent.press(screen.getByText(NEXT))

  await waitFor(() => {
    expect(screen.getByText(/5,000 characters/)).toBeTruthy()
  })
  expect(navigation.navigate).not.toHaveBeenCalledWith('ReviewSpot', expect.anything())
})

it('rests the footer on the keyboard — not under it, and not floating above it (STOURIFY-257)', () => {
  // RN's own jest mock (`react-native/jest/MockNativeMethods.js`) makes
  // `measure` a no-op shared by every `View` in the tree — real enough to
  // exist, not real enough to report a position. `useKeyboardOverlap` needs
  // one that does, standing in for the wrapper's screen position: below the
  // keyboard test's own bottom on purpose, because this app's screen sits
  // above a tab bar and the wrapper's real bottom edge is never the bottom of
  // the screen. A mock that put them level would pass even with the bug this
  // hook replaced (padding by the keyboard's raw height) — this one would not.
  const WRAPPER_BOTTOM = 720
  ;(View.prototype.measure as jest.Mock).mockImplementation(
    (
      callback: (
        x: number,
        y: number,
        width: number,
        height: number,
        pageX: number,
        pageY: number,
      ) => void,
    ) => callback(0, 0, 400, 100, 0, WRAPPER_BOTTOM - 100),
  )

  renderForm(createTestDatabase())

  const restingPadding = screen.getByTestId('create-spot-footer').props.style.paddingBottom

  act(() => {
    // `keyboardWillShow` — Jest's RN preset defaults `Platform.OS` to `'ios'`
    // (`react-native/jest-preset.js` → `haste.defaultPlatform`), which is the
    // event pair `useKeyboardOverlap` listens for there.
    DeviceEventEmitter.emit('keyboardWillShow', {
      duration: 0,
      easing: 'keyboard',
      endCoordinates: { screenX: 0, screenY: 500, width: 400, height: 300 },
    })
  })

  // The wrapper's bottom edge (720) sits 80dp above the keyboard's own bottom
  // (500 + 300 = 800), so only 720 - 500 = 220 of it is actually covered —
  // not the keyboard's full 300dp height. Padding by the full height is
  // exactly the overshoot this test would catch.
  expect(screen.getByTestId('create-spot-footer').props.style.paddingBottom).toBe(
    restingPadding + 220,
  )

  act(() => {
    DeviceEventEmitter.emit('keyboardWillHide', {
      duration: 0,
      easing: 'keyboard',
      endCoordinates: { screenX: 0, screenY: 800, width: 400, height: 0 },
    })
  })

  expect(screen.getByTestId('create-spot-footer').props.style.paddingBottom).toBe(restingPadding)

  ;(View.prototype.measure as jest.Mock).mockReset()
})

it('routes to capture from the add-photo tile', () => {
  renderForm(createTestDatabase())

  fireEvent.press(screen.getByLabelText('Add photos'))
  expect(navigation.navigate).toHaveBeenCalledWith('CameraCapture')
})

it('shows the captured photos as they are queued', async () => {
  const database = createTestDatabase()
  renderForm(database)

  await capture(database, 'one.jpg')
  await capture(database, 'two.jpg')

  await waitFor(() => {
    expect(screen.getByLabelText('one.jpg')).toBeTruthy()
    expect(screen.getByLabelText('two.jpg')).toBeTruthy()
  })
})

it('at the cap, the add-photo tile is disabled rather than hidden', async () => {
  const database = createTestDatabase()
  for (const filename of ['one.jpg', 'two.jpg', 'three.jpg']) await capture(database, filename)

  renderForm(database)

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

/**
 * STOURIFY-202 — "My spots" has to say whether a spot is actually live.
 *
 * This list is where the bug should have been obvious and was not. Every spot
 * the app created was silently saved as an unfinished draft that nobody,
 * including its author, could find anywhere — and a draft looked exactly like a
 * live spot here, so the app's own list gave no hint that nothing had gone out.
 */
async function makeSpot(database: Database, status: string, title: string) {
  return database.write(async () =>
    database.get<Spot>('sto_spots').create((row: any) => {
      row._raw.id = `spot-${status}`
      row._raw.uuid = `spot-${status}`
      row._raw.title = title
      row._raw.latitude = 1
      row._raw.longitude = 1
      row._raw.status = status
      row._raw.is_verified = false
      row._raw.reviews_count = 0
      row._raw.saves_count = 0
      row._raw.created_at = 1
      row._raw.updated_at = 1
    }),
  )
}

function renderMySpots(database: Database) {
  return render(
    <TestProviders database={database}>
      <MySpotsScreen navigation={navigation} route={route} />
    </TestProviders>,
  )
}

it('My Spots says when a spot is not visible to anyone', async () => {
  const database = createTestDatabase()
  renderMySpots(database)

  await makeSpot(database, 'draft', 'Unfinished Spot')

  await waitFor(() => {
    expect(screen.getByText('Draft — not visible to anyone')).toBeTruthy()
  })
})

it('My Spots says nothing extra about a spot that is live', async () => {
  const database = createTestDatabase()
  renderMySpots(database)

  await makeSpot(database, 'published', 'Live Spot')

  await waitFor(() => {
    expect(screen.getByText('Live Spot')).toBeTruthy()
  })

  // Being live is the ordinary case, and a badge on everything is a badge on
  // nothing. Only the exception is worth saying out loud.
  expect(screen.queryByText('Draft — not visible to anyone')).toBeNull()
})

it('My Spots explains a spot that is being checked, rather than naming its state', async () => {
  const database = createTestDatabase()
  renderMySpots(database)

  await makeSpot(database, 'under_review', 'Pending Spot')

  await waitFor(() => {
    // The reader's question is "can anyone see this?", not "what is this row's
    // status column set to?" — so the answer is written in those terms.
    expect(screen.getByText('Being checked — not visible yet')).toBeTruthy()
  })
})
