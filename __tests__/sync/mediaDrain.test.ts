import type { Database } from '@nozbe/watermelondb'
import type PendingMedia from '@/db/models/PendingMedia'
import { createTestDatabase, markSynced, seedSpot } from '../support/testDatabase'

/**
 * A deterministic stand-in for the native module — same shape as
 * `queueLocalMedia.test.ts`'s mock, plus the read/delete surface phase 2 needs.
 */
const fsCalls: { deletes: string[] } = { deletes: [] }
const mockFileRegistry = new Map<string, boolean>()

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string

    constructor(...uris: Array<string | { uri: string }>) {
      this.uri = uris.map((u) => (typeof u === 'string' ? u : u.uri)).join('/')
    }

    get exists() {
      return mockFileRegistry.get(this.uri) ?? true
    }

    async bytes() {
      return new Uint8Array([1, 2, 3])
    }

    delete() {
      mockFileRegistry.set(this.uri, false)
      fsCalls.deletes.push(this.uri)
    }
  }

  return { __esModule: true, File: MockFile }
})

const mockRequestUploadUrl = jest.fn()
const mockPutFile = jest.fn()
const mockAttachMedia = jest.fn()

jest.mock('@/shared/api/media', () => ({
  requestUploadUrl: (...args: unknown[]) => mockRequestUploadUrl(...args),
  putFile: (...args: unknown[]) => mockPutFile(...args),
  attachMedia: (...args: unknown[]) => mockAttachMedia(...args),
}))

import { drainPendingMedia } from '@/sync/mediaDrain'

async function seedPendingMedia(
  database: Database,
  overrides: Partial<{
    id: string
    hostType: string
    hostUuid: string
    localPath: string
    filename: string
    mime: string
    size: number
    state: string
    attempts: number
  }> = {},
): Promise<PendingMedia> {
  const seed = {
    id: 'media-1',
    hostType: 'stourify_spot',
    hostUuid: 'spot-uuid-1',
    localPath: 'file:///document-dir/media-outbox/media-1.jpg',
    filename: 'beach.jpg',
    mime: 'image/jpeg',
    size: 12345,
    state: 'pending',
    attempts: 0,
    ...overrides,
  }

  return database.write(async () =>
    database.get<PendingMedia>('pending_media').create((row: any) => {
      row._raw.id = seed.id
      row._raw.host_type = seed.hostType
      row._raw.host_uuid = seed.hostUuid
      row._raw.local_path = seed.localPath
      row._raw.filename = seed.filename
      row._raw.mime = seed.mime
      row._raw.size = seed.size
      row._raw.state = seed.state
      row._raw.attempts = seed.attempts
      row._raw.created_at = Date.now()
    }),
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFileRegistry.clear()
  fsCalls.deletes = []
})

describe('drainPendingMedia', () => {
  it('skips a pending row whose host is still dirty — attach resolves by model_uuid, so the host must exist server-side first', async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-uuid-1' }) // left dirty — never markSynced'd
    await seedPendingMedia(database, { hostUuid: 'spot-uuid-1' })

    const outcome = await drainPendingMedia(database)

    expect(mockRequestUploadUrl).not.toHaveBeenCalled()
    expect(outcome.uploaded).toBe(0)
    expect(outcome.skipped).toBe(1)

    const row = await database.get<PendingMedia>('pending_media').find('media-1')
    expect(row.state).toBe('pending')
  })

  it('runs presign -> PUT -> attach in order, with the correct model_uuid, once the host is acked', async () => {
    const database = createTestDatabase()
    const spot = await seedSpot(database, { uuid: 'spot-uuid-1' })
    await markSynced(database, spot)
    await seedPendingMedia(database, { hostUuid: 'spot-uuid-1' })

    const callOrder: string[] = []
    mockRequestUploadUrl.mockImplementation(async () => {
      callOrder.push('presign')
      return { key: 'media-outbox/media-1.jpg', url: 'https://s3.example.com/x', headers: { 'Content-Type': 'image/jpeg' }, expires_at: 'later' }
    })
    mockPutFile.mockImplementation(async () => {
      callOrder.push('put')
    })
    mockAttachMedia.mockImplementation(async () => {
      callOrder.push('attach')
      return { uuid: 'media-uuid-1' }
    })

    await drainPendingMedia(database)

    expect(callOrder).toEqual(['presign', 'put', 'attach'])
    expect(mockRequestUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ modelType: 'stourify_spot', modelUuid: 'spot-uuid-1' }),
    )
    expect(mockAttachMedia).toHaveBeenCalledWith(
      expect.objectContaining({ modelType: 'stourify_spot', modelUuid: 'spot-uuid-1', key: 'media-outbox/media-1.jpg' }),
    )
  })

  it('on success, deletes the local file and the row', async () => {
    const database = createTestDatabase()
    const spot = await seedSpot(database, { uuid: 'spot-uuid-1' })
    await markSynced(database, spot)
    await seedPendingMedia(database, { hostUuid: 'spot-uuid-1', localPath: 'file:///document-dir/media-outbox/media-1.jpg' })

    mockRequestUploadUrl.mockResolvedValueOnce({ key: 'k', url: 'https://s3.example.com/x', headers: {}, expires_at: 'later' })
    mockPutFile.mockResolvedValueOnce(undefined)
    mockAttachMedia.mockResolvedValueOnce({ uuid: 'media-uuid-1' })

    const outcome = await drainPendingMedia(database)

    expect(outcome.uploaded).toBe(1)
    expect(fsCalls.deletes).toContain('file:///document-dir/media-outbox/media-1.jpg')
    await expect(database.get<PendingMedia>('pending_media').find('media-1')).rejects.toThrow()
  })

  it('a network failure leaves the row pending with the file intact and retryable, and does not bump attempts', async () => {
    const database = createTestDatabase()
    const spot = await seedSpot(database, { uuid: 'spot-uuid-1' })
    await markSynced(database, spot)
    await seedPendingMedia(database, { hostUuid: 'spot-uuid-1' })

    const networkError = Object.assign(new Error('Network Error'), { isAxiosError: true, request: {} })
    mockRequestUploadUrl.mockRejectedValueOnce(networkError)

    const outcome = await drainPendingMedia(database)

    expect(outcome.networkFailure).toBe(true)
    expect(outcome.uploaded).toBe(0)
    expect(outcome.failed).toBe(0)
    expect(fsCalls.deletes).toHaveLength(0)

    const row = await database.get<PendingMedia>('pending_media').find('media-1')
    expect(row.state).toBe('pending')
    expect(row.attempts).toBe(0)
  })

  it('a 422 at attach marks the row failed with the server message', async () => {
    const database = createTestDatabase()
    const spot = await seedSpot(database, { uuid: 'spot-uuid-1' })
    await markSynced(database, spot)
    await seedPendingMedia(database, { hostUuid: 'spot-uuid-1' })

    mockRequestUploadUrl.mockResolvedValueOnce({ key: 'k', url: 'https://s3.example.com/x', headers: {}, expires_at: 'later' })
    mockPutFile.mockResolvedValueOnce(undefined)
    const rejection = Object.assign(new Error('Request failed with status code 422'), {
      isAxiosError: true,
      response: { status: 422, data: { message: 'The file exceeds the maximum size.', errors: { size: ['too large'] } } },
    })
    mockAttachMedia.mockRejectedValueOnce(rejection)

    const outcome = await drainPendingMedia(database)

    expect(outcome.failed).toBe(1)
    const row = await database.get<PendingMedia>('pending_media').find('media-1')
    expect(row.state).toBe('failed')
    expect(row.attempts).toBe(1)
    expect(row.lastError).toBe('The file exceeds the maximum size.')
    // The file must survive a rejected attach — the user can retry.
    expect(fsCalls.deletes).toHaveLength(0)
  })
})
