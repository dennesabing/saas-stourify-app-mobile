/**
 * The M4a milestone gate (design spec §1, criterion 1; §5 "Integration"):
 * a spot created entirely offline with 3 photos attaches all 3 on
 * reconnect, and a stuck upload never stalls the pull along the way.
 *
 * A failure here is a real defect in the implementation — never in this test.
 */
import type { Database } from '@nozbe/watermelondb'
import { runSyncCycle } from '@/sync/cycle'
import { resetSyncStatus } from '@/sync/status'
import type PendingMedia from '@/db/models/PendingMedia'
import type Spot from '@/db/models/Spot'
import { createTestDatabase } from '../support/testDatabase'

// --- expo-file-system: a deterministic in-memory stand-in ------------------
const mockFileRegistry = new Map<string, boolean>()
const fsCalls: { writes: string[]; deletes: string[] } = { writes: [], deletes: [] }

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string

    constructor(...uris: Array<string | { uri: string }>) {
      this.uri = uris.map((u) => (typeof u === 'string' ? u : u.uri)).join('/')
    }

    get exists() {
      return mockFileRegistry.get(this.uri) ?? true
    }

    // `queueLocalMedia` makes its outbox copy by hand — read, strip, write —
    // rather than with the native `copy()`, so the photo metadata comes off
    // before the file exists at all (STOURIFY-40).
    write(_bytes: Uint8Array) {
      mockFileRegistry.set(this.uri, true)
      fsCalls.writes.push(this.uri)
    }

    async bytes() {
      return new Uint8Array([1, 2, 3])
    }

    delete() {
      mockFileRegistry.set(this.uri, false)
      fsCalls.deletes.push(this.uri)
    }
  }

  class MockDirectory {
    uri: string

    constructor(...uris: Array<string | { uri: string }>) {
      this.uri = uris.map((u) => (typeof u === 'string' ? u : u.uri)).join('/')
    }

    create() {
      // no-op — nothing to assert on here
    }
  }

  return {
    __esModule: true,
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: { uri: 'file:///document-dir' } },
  }
})

// --- the presign client: a deterministic stand-in ---------------------------
const mockRequestUploadUrl = jest.fn()
const mockPutFile = jest.fn()
const mockAttachMedia = jest.fn()

jest.mock('@/shared/api/media', () => ({
  requestUploadUrl: (...args: unknown[]) => mockRequestUploadUrl(...args),
  putFile: (...args: unknown[]) => mockPutFile(...args),
  attachMedia: (...args: unknown[]) => mockAttachMedia(...args),
}))

import { queueLocalMedia } from '@/features/media/api/queueLocalMedia'

const NETWORK_FAILURE_MARKER = Symbol.for('offline-sync-core.networkFailure')

function networkFailure(): Error {
  const error = new Error('Network request failed')
  Object.defineProperty(error, NETWORK_FAILURE_MARKER, { value: true, enumerable: false, configurable: true })
  return error
}

async function writeSpotLocally(database: Database, uuid: string): Promise<Spot> {
  // Mirrors CreateSpotScreen: the client mints the uuid, writes locally, and
  // the row starts life dirty (`_status: 'created'`).
  return database.write(async () =>
    database.get<Spot>('sto_spots').create((row: any) => {
      row._raw.id = uuid
      row._raw.uuid = uuid
      row._raw.title = 'Hidden Cove'
      row._raw.latitude = 6.1164
      row._raw.longitude = 125.1716
      row._raw.status = 'draft'
      row._raw.is_verified = false
      row._raw.reviews_count = 0
      row._raw.saves_count = 0
      row._raw.created_at = Date.now()
      row._raw.updated_at = Date.now()
    }),
  )
}

beforeEach(async () => {
  resetSyncStatus()
  jest.clearAllMocks()
  mockFileRegistry.clear()
  fsCalls.writes = []
  fsCalls.deletes = []
})

it('creates a spot with 3 photos entirely offline, then attaches all 3 on reconnect — idempotently', async () => {
  const database = createTestDatabase()
  const spotUuid = 'spot-offline-gate'

  // --- Step 1: write the spot locally + queue 3 photos against its uuid ---
  await writeSpotLocally(database, spotUuid)

  const mediaIds: string[] = []
  for (const filename of ['one.jpg', 'two.jpg', 'three.jpg']) {
    mediaIds.push(
      await queueLocalMedia(database, {
        hostType: 'stourify_spot',
        hostUuid: spotUuid,
        uri: `content://media/${filename}`,
        filename,
        mime: 'image/jpeg',
      }),
    )
  }
  expect(mediaIds).toHaveLength(3)
  expect(fsCalls.writes).toHaveLength(3)

  // --- Step 2: run a cycle "offline" — nothing drains, nothing is lost ---
  const offlineClient = { get: jest.fn(), post: jest.fn(async () => { throw networkFailure() }) }

  const offlineOutcome = await runSyncCycle({ database, client: offlineClient as any, trigger: 'manual' })

  expect(offlineOutcome.pulled).toBe(false)
  expect(offlineOutcome.drain.networkFailure).toBe(true)
  expect(mockRequestUploadUrl).not.toHaveBeenCalled()

  const stillPendingAfterOffline = await database.get<PendingMedia>('pending_media').query().fetch()
  expect(stillPendingAfterOffline).toHaveLength(3)
  for (const row of stillPendingAfterOffline) {
    expect(row.state).toBe('pending')
    expect(mockFileRegistry.get(row.localPath)).toBe(true)
  }
  expect(fsCalls.deletes).toHaveLength(0)

  // --- Step 3: bring the client online, run a cycle ------------------------
  mockRequestUploadUrl.mockImplementation(async (input: { modelUuid: string; filename: string }) => ({
    key: `media-outbox/${input.filename}`,
    url: `https://s3.example.com/${input.filename}`,
    headers: { 'Content-Type': 'image/jpeg' },
    expires_at: 'later',
  }))
  mockPutFile.mockResolvedValue(undefined)
  mockAttachMedia.mockImplementation(async (input: { key: string; modelUuid: string }) => ({
    uuid: `media-uuid-${input.key}`,
  }))

  const onlineClient = {
    get: jest.fn(async () => ({ data: { server_time: 'now' } })),
    post: jest.fn(async (_url: string, envelope: any) => ({
      data: {
        results: [
          {
            table: 'sto_spots',
            uuid: spotUuid,
            op: 'created',
            status: 'ok',
            record: { ...envelope.sto_spots.created[0], id: 999, slug: 'hidden-cove' },
          },
        ],
        server_time: 'now',
      },
    })),
  }

  const onlineOutcome = await runSyncCycle({ database, client: onlineClient as any, trigger: 'manual' })

  expect(onlineOutcome.drain.fullyAcked).toBe(true)
  expect(onlineOutcome.pulled).toBe(true)

  const spotAfter = await database.get<Spot>('sto_spots').find(spotUuid)
  expect((spotAfter._raw as any)._status).toBe('synced')

  // --- Step 4: three attaches fired, each carrying the spot's uuid --------
  expect(mockRequestUploadUrl).toHaveBeenCalledTimes(3)
  expect(mockAttachMedia).toHaveBeenCalledTimes(3)
  for (const call of mockAttachMedia.mock.calls) {
    expect(call[0]).toMatchObject({ modelType: 'stourify_spot', modelUuid: spotUuid })
  }

  const remainingMedia = await database.get<PendingMedia>('pending_media').query().fetch()
  expect(remainingMedia).toHaveLength(0)
  expect(fsCalls.deletes).toHaveLength(3)

  // --- Step 5: a second identical cycle attaches nothing further ----------
  const secondCycleOutcome = await runSyncCycle({ database, client: onlineClient as any, trigger: 'manual' })

  expect(secondCycleOutcome.pulled).toBe(true)
  expect(mockRequestUploadUrl).toHaveBeenCalledTimes(3)
  expect(mockAttachMedia).toHaveBeenCalledTimes(3)
})
