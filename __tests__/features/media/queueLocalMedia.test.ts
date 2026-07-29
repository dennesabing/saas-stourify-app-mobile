import type { Database } from '@nozbe/watermelondb'
import type PendingMedia from '@/db/models/PendingMedia'
import { createTestDatabase } from '../../support/testDatabase'

/**
 * A deterministic stand-in for the native module. Records every `copy()` and
 * `create()` call so tests can assert the bytes were actually copied — not
 * just that a row was written — without touching a real filesystem.
 */
const fsCalls: { copies: { from: string; to: string }[]; creates: { uri: string }[] } = {
  copies: [],
  creates: [],
}

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string
    size = 54321

    constructor(...uris: Array<string | { uri: string }>) {
      this.uri = uris.map((u) => (typeof u === 'string' ? u : u.uri)).join('/')
    }

    copy(destination: { uri: string }) {
      fsCalls.copies.push({ from: this.uri, to: destination.uri })
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
  fsCalls.copies = []
  fsCalls.creates = []
})

describe('queueLocalMedia', () => {
  it('copies the picker file into app-private storage rather than trusting the original URI', async () => {
    const pickerUri = 'content://media/external/images/media/9999'

    const id = await queueLocalMedia(database, {
      hostType: 'stourify_spot',
      hostUuid: 'spot-uuid-1',
      uri: pickerUri,
      filename: 'beach.jpg',
      mime: 'image/jpeg',
    })

    expect(fsCalls.copies).toHaveLength(1)
    expect(fsCalls.copies[0].from).toBe(pickerUri)

    const row = await database.get<PendingMedia>('pending_media').find(id)

    // The row must point at the COPY, never the picker URI — the URI is an
    // OS cache entry Android may reclaim; the copy is what survives an app
    // kill.
    expect(row.localPath).not.toBe(pickerUri)
    expect(row.localPath).toBe(fsCalls.copies[0].to)
    expect(row.localPath).toContain('media-outbox')
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
