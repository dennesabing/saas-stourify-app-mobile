import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { Database } from '@nozbe/watermelondb'
import ReviewSpotScreen from '@/features/create/screens/ReviewSpotScreen'
import type PendingMedia from '@/db/models/PendingMedia'
import type Spot from '@/db/models/Spot'
import { createTestDatabase } from '../support/testDatabase'
import { TestProviders } from '../support/TestProviders'

jest.mock('@/sync/scheduler', () => ({ syncNow: jest.fn(async () => undefined) }))

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

import { queueCapturedPhoto } from '@/features/media/api/draftMedia'

async function capture(database: Database, filename: string): Promise<void> {
  await queueCapturedPhoto(database, {
    uri: `content://camera/${filename}`,
    filename,
    mime: 'image/jpeg',
  })
}

/**
 * Review & Publish — the last create step, and since STOURIFY-257 the only one
 * that writes. These are the assertions that used to live on the form: the
 * offline-first write, the published status, and the M4 photo bind.
 */
const navigation = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() } as any

const FORM = {
  title: 'Hidden Cove',
  description: 'A quiet beach behind the rocks.',
  categories: ['Coast', 'Nature'],
  coordinate: { latitude: 6.1164, longitude: 125.1716 },
}

function renderReview(database: Database, params = FORM) {
  return render(
    <TestProviders database={database}>
      <ReviewSpotScreen navigation={navigation} route={{ params } as any} />
    </TestProviders>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

it('previews the spot the way others will see it', () => {
  renderReview(createTestDatabase())

  expect(screen.getByText('Hidden Cove')).toBeTruthy()
  expect(screen.getByText('A quiet beach behind the rocks.')).toBeTruthy()
  expect(screen.getByText('Coast')).toBeTruthy()
  expect(screen.getByText('Nature')).toBeTruthy()
  expect(screen.getByText('6.1164, 125.1716')).toBeTruthy()
  expect(screen.getByText(/saved offline first/i)).toBeTruthy()
})

it('uses the first captured photo as the cover', async () => {
  const database = createTestDatabase()
  await capture(database, 'one.jpg')

  renderReview(database)

  await waitFor(() => {
    expect(screen.getByTestId('review-cover')).toBeTruthy()
  })
})

it('writes the spot straight to the local database and never to the network', async () => {
  const database = createTestDatabase()
  const fetchSpy = jest.fn()
  global.fetch = fetchSpy as unknown as typeof fetch

  renderReview(database)
  fireEvent.press(screen.getByText('Publish spot'))

  await waitFor(async () => {
    expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(1)
  })

  expect(fetchSpy).not.toHaveBeenCalled()

  const [spot] = await database.get<Spot>('sto_spots').query().fetch()
  expect(spot.title).toBe('Hidden Cove')
  expect(spot.latitude).toBeCloseTo(6.1164)
  expect(spot.longitude).toBeCloseTo(125.1716)
  expect(spot.categories).toEqual(['Coast', 'Nature'])
  // Published, not draft (STOURIFY-202). The old form test read 'draft' and
  // passed for months — it did not miss the bug, it PINNED it.
  expect(spot.status).toBe('published')
  expect(spot.isQueued).toBe(true)
  expect(spot.uuid).toBe(spot.id)
})

it('lands on My Spots with Review gone from the stack, so Back cannot publish twice', async () => {
  renderReview(createTestDatabase())
  fireEvent.press(screen.getByText('Publish spot'))

  await waitFor(() => {
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 1,
      routes: [{ name: 'CreateMenu' }, { name: 'MySpots' }],
    })
  })
})

it('shows no loading spinner, because a local write cannot fail for network reasons', () => {
  renderReview(createTestDatabase())

  expect(screen.queryByTestId('create-spot-loading')).toBeNull()
})

it('binds every captured photo to the published spot — the M4 gate, in one screen', async () => {
  const database = createTestDatabase()
  const fetchSpy = jest.fn()
  global.fetch = fetchSpy as unknown as typeof fetch

  for (const filename of ['one.jpg', 'two.jpg', 'three.jpg']) await capture(database, filename)

  renderReview(database)

  await waitFor(() => {
    expect(screen.getByText('3 photos')).toBeTruthy()
  })

  fireEvent.press(screen.getByText('Publish spot'))

  await waitFor(() => {
    expect(navigation.reset).toHaveBeenCalled()
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
