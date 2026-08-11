/**
 * Publish is the one write that makes a captured photo reachable.
 *
 * STOURIFY-3 queues photos deliberately unbound (`host_uuid = ''`), and
 * `drainPendingMedia` skips an unbound row forever — silently, by design, so no
 * gating code had to be added (design spec §2.3 rule 3). That means the bind
 * performed here is the *only* thing standing between a photo and the outbox it
 * never leaves. These assertions are about that bind and nothing else.
 */
import type { Database } from '@nozbe/watermelondb'
import type PendingMedia from '@/db/models/PendingMedia'
import type Spot from '@/db/models/Spot'
import { createTestDatabase } from '../../support/testDatabase'

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

/**
 * `listDraftMedia` is spied rather than replaced.
 *
 * Every case below wants the real query; exactly one wants to simulate a draft
 * row appearing between the bind and the check, which is the only way the
 * post-write invariant can be observed from outside. A partial mock keeps the
 * other cases honest.
 */
jest.mock('@/features/media/api/draftMedia', () => {
  const actual = jest.requireActual('@/features/media/api/draftMedia')
  return {
    ...actual,
    listDraftMedia: jest.fn((...args: unknown[]) => actual.listDraftMedia(...(args as [never]))),
  }
})

import { listDraftMedia, queueCapturedPhoto, MAX_DRAFT_PHOTOS } from '@/features/media/api/draftMedia'
import { publishSpot } from '@/features/create/api/publishSpot'

const DRAFT_INPUT = {
  title: 'Hidden Cove',
  description: 'Worth the boat ride.',
  latitude: 6.1164,
  longitude: 125.1716,
  userId: 7,
}

async function capture(database: Database, filename: string): Promise<string> {
  return queueCapturedPhoto(database, {
    uri: `content://camera/${filename}`,
    filename,
    mime: 'image/jpeg',
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

it('binds every captured photo to the spot uuid it mints', async () => {
  const database = createTestDatabase()
  for (const filename of ['one.jpg', 'two.jpg', 'three.jpg']) await capture(database, filename)

  const result = await publishSpot(database, DRAFT_INPUT)

  expect(result.photoCount).toBe(3)

  const spot = await database.get<Spot>('sto_spots').find(result.uuid)
  // Rule 1: the uuid is the row's identity, minted before the write, and the
  // push preserves it — which is the only reason the bind below is valid.
  expect(spot.uuid).toBe(result.uuid)
  expect(spot.id).toBe(result.uuid)
  expect(spot.title).toBe('Hidden Cove')

  const media = await database.get<PendingMedia>('pending_media').query().fetch()
  expect(media).toHaveLength(3)
  for (const row of media) {
    expect(row.hostUuid).toBe(result.uuid)
    expect(row.hostType).toBe('stourify_spot')
    expect(row.state).toBe('pending')
  }
})

it('leaves no unbound draft row behind', async () => {
  const database = createTestDatabase()
  await capture(database, 'one.jpg')

  await publishSpot(database, DRAFT_INPUT)

  expect(await listDraftMedia(database)).toHaveLength(0)
})

it('publishes a spot with no photos at all', async () => {
  const database = createTestDatabase()

  const result = await publishSpot(database, DRAFT_INPUT)

  expect(result.photoCount).toBe(0)
  expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(1)
  expect(await database.get<PendingMedia>('pending_media').query().fetchCount()).toBe(0)
})

it('trims the title and stores an empty description as null', async () => {
  const database = createTestDatabase()

  const result = await publishSpot(database, { ...DRAFT_INPUT, title: '  Kalaklan Point  ', description: '   ' })

  const spot = await database.get<Spot>('sto_spots').find(result.uuid)
  expect(spot.title).toBe('Kalaklan Point')
  expect(spot.description).toBeNull()
})

it('leaves the spot queued — dirty, never synced, never pushed by publish itself', async () => {
  const database = createTestDatabase()

  const result = await publishSpot(database, DRAFT_INPUT)

  const spot = await database.get<Spot>('sto_spots').find(result.uuid)
  expect(spot.isQueued).toBe(true)
  expect((spot._raw as any)._status).toBe('created')
})

it('never touches the network', async () => {
  const database = createTestDatabase()
  const fetchSpy = jest.fn()
  global.fetch = fetchSpy as unknown as typeof fetch
  await capture(database, 'one.jpg')

  await publishSpot(database, DRAFT_INPUT)

  expect(fetchSpy).not.toHaveBeenCalled()
})

it('refuses to publish more drafts than the cap, and writes nothing when it does', async () => {
  const database = createTestDatabase()
  // Past the cap is only reachable if the capture-time cap failed, so this is a
  // bug report, not a trim: silently dropping a photo the user took is worse
  // than refusing.
  const overCap = Array.from({ length: MAX_DRAFT_PHOTOS + 1 }, (_, i) => `over-${i}.jpg`)
  for (const filename of overCap) await capture(database, filename)

  await expect(publishSpot(database, DRAFT_INPUT)).rejects.toThrow(/cap/i)

  expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(0)
  const media = await database.get<PendingMedia>('pending_media').query().fetch()
  for (const row of media) expect(row.hostUuid).toBe('')
})

it('throws when a pending media row survives the bind unbound', async () => {
  const database = createTestDatabase()
  await capture(database, 'one.jpg')

  // The bind reads an empty draft set, so it binds nothing — and the row is
  // still there when the invariant is checked. That is the shape of the bug the
  // assertion exists to catch: a published spot whose photos point at nothing.
  ;(listDraftMedia as jest.Mock).mockResolvedValueOnce([])

  await expect(publishSpot(database, DRAFT_INPUT)).rejects.toThrow(/unbound/i)
})
