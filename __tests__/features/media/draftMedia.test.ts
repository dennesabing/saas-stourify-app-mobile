import type { Database } from '@nozbe/watermelondb'
import type PendingMedia from '@/db/models/PendingMedia'
import { createTestDatabase } from '../../support/testDatabase'

/**
 * The same deterministic stand-in `queueLocalMedia.test.ts` uses, extended to
 * record `delete()`.
 *
 * Recording the deletes is the whole point of this file: "remove must delete
 * the local file as well as the row" is a claim about the filesystem, and a
 * test that only counts rows cannot tell a clean remove from a storage leak.
 */
const fsCalls: {
  copies: { from: string; to: string }[]
  deletes: string[]
} = { copies: [], deletes: [] }

jest.mock('expo-file-system', () => {
  /** Paths the mock filesystem currently believes exist. */
  const present = new Set<string>()

  class MockFile {
    uri: string
    size = 12345

    constructor(...uris: Array<string | { uri: string }>) {
      this.uri = uris.map((u) => (typeof u === 'string' ? u : u.uri)).join('/')
    }

    get exists(): boolean {
      return present.has(this.uri)
    }

    copy(destination: { uri: string }) {
      fsCalls.copies.push({ from: this.uri, to: destination.uri })
      present.add(destination.uri)
    }

    delete() {
      fsCalls.deletes.push(this.uri)
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

import {
  DRAFT_HOST_UUID,
  MAX_DRAFT_PHOTOS,
  listDraftMedia,
  queueCapturedPhoto,
  removeDraftMedia,
} from '@/features/media/api/draftMedia'

let database: Database

beforeEach(() => {
  database = createTestDatabase()
  fsCalls.copies = []
  fsCalls.deletes = []
})

describe('queueCapturedPhoto', () => {
  it('queues the photo unbound, so publish is the only thing that can bind it', async () => {
    const id = await queueCapturedPhoto(database, {
      uri: 'file:///cache/Camera/IMG_0001.jpg',
      filename: 'IMG_0001.jpg',
      mime: 'image/jpeg',
    })

    const row = await database.get<PendingMedia>('pending_media').find(id)

    expect(row.hostUuid).toBe(DRAFT_HOST_UUID)
    expect(row.hostType).toBe('stourify_spot')
    expect(row.state).toBe('pending')
  })

  it('copies the bytes out of the OS cache rather than recording the camera URI', async () => {
    const cameraUri = 'file:///cache/Camera/IMG_0002.jpg'

    const id = await queueCapturedPhoto(database, {
      uri: cameraUri,
      filename: 'IMG_0002.jpg',
      mime: 'image/jpeg',
    })

    const row = await database.get<PendingMedia>('pending_media').find(id)

    expect(fsCalls.copies).toHaveLength(1)
    expect(fsCalls.copies[0].from).toBe(cameraUri)
    expect(row.localPath).toBe(fsCalls.copies[0].to)
    expect(row.localPath).not.toBe(cameraUri)
    expect(row.localPath).toContain('media-outbox')
  })
})

describe('listDraftMedia', () => {
  it('returns the unbound photos oldest first, so the strip reads in capture order', async () => {
    // `created_at` is the sort key and it is millisecond-resolution, so two
    // photos queued inside the same tick tie. A real shutter cannot fire twice
    // in one millisecond; a test loop can, so the clock is made explicit rather
    // than letting the assertion depend on a tie-break that does not exist.
    const clock = jest.spyOn(Date, 'now')
    clock.mockReturnValueOnce(1_700_000_000_000).mockReturnValueOnce(1_700_000_005_000)

    const first = await queueCapturedPhoto(database, {
      uri: 'file:///cache/1.jpg',
      filename: '1.jpg',
      mime: 'image/jpeg',
    })
    const second = await queueCapturedPhoto(database, {
      uri: 'file:///cache/2.jpg',
      filename: '2.jpg',
      mime: 'image/jpeg',
    })

    clock.mockRestore()

    const rows = await listDraftMedia(database)

    expect(rows.map((row) => row.id)).toEqual([first, second])
  })

  it('ignores a photo already bound to a spot — that one belongs to a published spot, not this draft', async () => {
    const draft = await queueCapturedPhoto(database, {
      uri: 'file:///cache/draft.jpg',
      filename: 'draft.jpg',
      mime: 'image/jpeg',
    })

    const bound = await queueCapturedPhoto(database, {
      uri: 'file:///cache/bound.jpg',
      filename: 'bound.jpg',
      mime: 'image/jpeg',
    })

    const boundRow = await database.get<PendingMedia>('pending_media').find(bound)
    await database.write(async () => {
      await boundRow.update((row: any) => {
        row._raw.host_uuid = 'spot-uuid-77'
      })
    })

    const rows = await listDraftMedia(database)

    expect(rows.map((row) => row.id)).toEqual([draft])
  })
})

describe('removeDraftMedia', () => {
  it('deletes the local file as well as the row — asserted, not assumed', async () => {
    const id = await queueCapturedPhoto(database, {
      uri: 'file:///cache/remove-me.jpg',
      filename: 'remove-me.jpg',
      mime: 'image/jpeg',
    })

    const row = await database.get<PendingMedia>('pending_media').find(id)
    const localPath = row.localPath

    await removeDraftMedia(database, id)

    // The row is gone …
    expect(await database.get<PendingMedia>('pending_media').query().fetchCount()).toBe(0)
    // … and so is the file. Without this half, every removed photo leaks a
    // copy in app-private storage that nothing will ever clean up.
    expect(fsCalls.deletes).toContain(localPath)
  })

  it('leaves the other draft photos and their files alone', async () => {
    const keep = await queueCapturedPhoto(database, {
      uri: 'file:///cache/keep.jpg',
      filename: 'keep.jpg',
      mime: 'image/jpeg',
    })
    const drop = await queueCapturedPhoto(database, {
      uri: 'file:///cache/drop.jpg',
      filename: 'drop.jpg',
      mime: 'image/jpeg',
    })

    const keptRow = await database.get<PendingMedia>('pending_media').find(keep)
    const keptPath = keptRow.localPath

    await removeDraftMedia(database, drop)

    const remaining = await listDraftMedia(database)
    expect(remaining.map((row) => row.id)).toEqual([keep])
    expect(fsCalls.deletes).not.toContain(keptPath)
  })
})

describe('MAX_DRAFT_PHOTOS', () => {
  it('is the cap the M4 gate names', () => {
    expect(MAX_DRAFT_PHOTOS).toBe(3)
  })
})
