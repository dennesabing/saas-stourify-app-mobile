import type { Database } from '@nozbe/watermelondb'
import type PendingMedia from '@/db/models/PendingMedia'
import { createTestDatabase } from '../../support/testDatabase'
import { MARKER, exifGpsSegment, jpegWith, markersOf } from '../../support/jpegFixtures'

/**
 * The bytes the fake picker hands back: a JPEG carrying an EXIF block with real
 * coordinates in it. The assertions below are about what reaches the outbox, so
 * the input has to genuinely contain what is supposed to be removed.
 */
// Named `mock…` because jest hoists the factory below above every import, and
// only names with that prefix may be referenced from inside it.
const mockPickerBytes = jpegWith([exifGpsSegment()])

/**
 * A deterministic stand-in for the native module. Records every read and every
 * write so tests can assert what actually landed in app-private storage —
 * not merely that a row was written — without touching a real filesystem.
 */
const fsCalls: {
  writes: { to: string; bytes: Uint8Array }[]
  creates: { uri: string }[]
} = { writes: [], creates: [] }

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string

    size = 54321

    constructor(...uris: Array<string | { uri: string }>) {
      this.uri = uris.map((u) => (typeof u === 'string' ? u : u.uri)).join('/')
    }

    bytes() {
      return Promise.resolve(mockPickerBytes)
    }

    write(bytes: Uint8Array) {
      fsCalls.writes.push({ to: this.uri, bytes })
    }
  }

  class MockDirectory {
    uri: string

    constructor(...uris: Array<string | { uri: string }>) {
      this.uri = uris.map((u) => (typeof u === 'string' ? u : u.uri)).join('/')
    }

    create() {
      fsCalls.creates.push({ uri: this.uri })
    }
  }

  return {
    __esModule: true,
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: { uri: 'file:///document-dir' } },
  }
})

import { queueLocalMedia } from '@/features/media/api/queueLocalMedia'

let database: Database

beforeEach(() => {
  database = createTestDatabase()
  fsCalls.writes = []
  fsCalls.creates = []
})

describe('queueLocalMedia', () => {
  it('writes the bytes into app-private storage rather than trusting the original URI', async () => {
    const pickerUri = 'content://media/external/images/media/9999'

    const id = await queueLocalMedia(database, {
      hostType: 'stourify_spot',
      hostUuid: 'spot-uuid-1',
      uri: pickerUri,
      filename: 'beach.jpg',
      mime: 'image/jpeg',
    })

    expect(fsCalls.writes).toHaveLength(1)

    const row = await database.get<PendingMedia>('pending_media').find(id)

    // The row must point at the COPY, never the picker URI — the URI is an
    // OS cache entry Android may reclaim; the copy is what survives an app
    // kill.
    expect(row.localPath).not.toBe(pickerUri)
    expect(row.localPath).toBe(fsCalls.writes[0].to)
    expect(row.localPath).toContain('media-outbox')
  })

  it('strips the photo metadata as it copies, so a queued photo never sits on disk with its coordinates', async () => {
    // The whole point of stripping HERE rather than at drain time: an offline
    // photo can wait on disk for days, and the file it waits as is this one.
    expect(markersOf(mockPickerBytes)).toContain(MARKER.APP1_EXIF)

    await queueLocalMedia(database, {
      hostType: 'stourify_spot',
      hostUuid: 'spot-uuid-1',
      uri: 'content://media/1',
      filename: 'beach.jpg',
      mime: 'image/jpeg',
    })

    expect(markersOf(fsCalls.writes[0].bytes)).not.toContain(MARKER.APP1_EXIF)
  })

  it('records the size of what was actually written, not of the original', async () => {
    const id = await queueLocalMedia(database, {
      hostType: 'stourify_spot',
      hostUuid: 'spot-uuid-1',
      uri: 'content://media/1',
      filename: 'beach.jpg',
      mime: 'image/jpeg',
    })

    const row = await database.get<PendingMedia>('pending_media').find(id)

    expect(row.size).toBe(fsCalls.writes[0].bytes.length)
    expect(row.size).toBeLessThan(mockPickerBytes.length)
  })

  it('carries the host type/uuid and starts pending with zero attempts', async () => {
    const id = await queueLocalMedia(database, {
      hostType: 'stourify_spot',
      hostUuid: 'spot-uuid-42',
      uri: 'content://media/1',
      filename: 'cove.png',
      mime: 'image/png',
    })

    const row = await database.get<PendingMedia>('pending_media').find(id)

    expect(row.hostType).toBe('stourify_spot')
    expect(row.hostUuid).toBe('spot-uuid-42')
    expect(row.filename).toBe('cove.png')
    expect(row.mime).toBe('image/png')
    expect(row.state).toBe('pending')
    expect(row.attempts).toBe(0)
  })

  it('queueing three files yields three distinct rows', async () => {
    const inputs = [
      { uri: 'content://media/1', filename: 'a.jpg', mime: 'image/jpeg' },
      { uri: 'content://media/2', filename: 'b.jpg', mime: 'image/jpeg' },
      { uri: 'content://media/3', filename: 'c.jpg', mime: 'image/jpeg' },
    ]

    const ids: string[] = []
    for (const input of inputs) {
      ids.push(
        await queueLocalMedia(database, {
          hostType: 'stourify_spot',
          hostUuid: 'spot-uuid-3',
          ...input,
        }),
      )
    }

    expect(new Set(ids).size).toBe(3)
    const rows = await database.get<PendingMedia>('pending_media').query().fetch()
    expect(rows).toHaveLength(3)
  })
})
