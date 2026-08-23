jest.mock('@/features/social/api/draftPhotoStore', () => ({
  copyDraftPhotos: jest.fn(async (ownerId: string, photos: any[]) =>
    photos.map((photo, index) => ({ ...photo, uri: `file:///kept/${ownerId}-${index}.jpg` })),
  ),
  deleteDraftPhotos: jest.fn(async () => undefined),
}))

const mockCreatePost = jest.fn()
const mockPublishPost = jest.fn()

jest.mock('@/shared/api/posts', () => ({
  createPost: (...args: unknown[]) => mockCreatePost(...args),
  publishPost: (...args: unknown[]) => mockPublishPost(...args),
}))

const mockUploadPostMedia = jest.fn()

jest.mock('@/features/social/api/uploadPostMedia', () => ({
  POST_MEDIA_HOST_TYPE: 'stourify_post',
  uploadPostMedia: (...args: unknown[]) => mockUploadPostMedia(...args),
}))

import axios from 'axios'
import type { Database } from '@nozbe/watermelondb'
import { createTestDatabase } from '../support/testDatabase'
import { deleteDraftPhotos } from '@/features/social/api/draftPhotoStore'
import { queuePost } from '@/features/social/api/postOutbox'
import { drainPostOutbox } from '@/sync/postOutboxDrain'
import type PostOutbox from '@/db/models/PostOutbox'

/** An error shaped like a dropped radio: axios's own "no response ever came". */
function networkError(): Error {
  return new axios.AxiosError('Network Error', 'ERR_NETWORK')
}

/** An error shaped like a server that answered and said no. */
function rejection(status: number, message: string): Error {
  const error = new axios.AxiosError('Request failed', 'ERR_BAD_REQUEST')
  error.response = { status, data: { message }, statusText: '', headers: {}, config: {} as any }
  return error
}

async function rowsFor(database: Database): Promise<PostOutbox[]> {
  return database.get<PostOutbox>('post_outbox').query().fetch()
}

describe('drainPostOutbox', () => {
  let database: Database

  beforeEach(() => {
    jest.clearAllMocks()
    database = createTestDatabase()
    mockCreatePost.mockResolvedValue({ uuid: 'post-uuid-new' })
    mockUploadPostMedia.mockResolvedValue(undefined)
    mockPublishPost.mockResolvedValue({ uuid: 'post-uuid-new' })
  })

  it('does nothing, and says so, when the box is empty', async () => {
    const outcome = await drainPostOutbox(database)

    expect(outcome).toEqual({ attempted: 0, published: 0, failed: 0, networkFailure: false })
    expect(mockCreatePost).not.toHaveBeenCalled()
  })

  it('creates, uploads and publishes — in that order — then throws the entry away', async () => {
    const id = await queuePost(database, {
      caption: 'Written in a tunnel',
      visibility: 'public',
      spotUuid: 'spot-1',
      spotTitle: 'Hidden Cove',
      media: [{ uri: 'file:///cache/photo.jpg', fileName: 'photo.jpg' }],
    })

    const outcome = await drainPostOutbox(database)

    expect(mockCreatePost).toHaveBeenCalledWith({
      visibility: 'public',
      publish: false,
      caption: 'Written in a tunnel',
      spot_uuid: 'spot-1',
    })
    expect(mockUploadPostMedia).toHaveBeenCalledWith(
      'post-uuid-new',
      [{ uri: `file:///kept/${id}-0.jpg`, fileName: 'photo.jpg' }],
      expect.objectContaining({ idempotencyKeyFor: expect.any(Function) }),
    )
    expect(mockPublishPost).toHaveBeenCalledWith('post-uuid-new')

    expect(outcome).toEqual({ attempted: 1, published: 1, failed: 0, networkFailure: false })
    expect(await rowsFor(database)).toHaveLength(0)
  })

  it('cleans up the photo copies once the post is really published', async () => {
    const id = await queuePost(database, {
      caption: 'x',
      visibility: 'private',
      media: [{ uri: 'file:///cache/photo.jpg', fileName: 'photo.jpg' }],
    })

    await drainPostOutbox(database)

    expect(deleteDraftPhotos).toHaveBeenCalledWith([
      { uri: `file:///kept/${id}-0.jpg`, fileName: 'photo.jpg' },
    ])
  })

  it('sends no caption key at all when there is nothing written', async () => {
    await queuePost(database, { caption: '', visibility: 'private', media: [] })

    await drainPostOutbox(database)

    expect(mockCreatePost).toHaveBeenCalledWith({ visibility: 'private', publish: false })
  })

  it('does not create a second post when the server already accepted the first', async () => {
    await queuePost(
      database,
      { caption: 'half sent', visibility: 'public', media: [] },
      { postUuid: 'post-already-there' },
    )

    await drainPostOutbox(database)

    expect(mockCreatePost).not.toHaveBeenCalled()
    expect(mockUploadPostMedia).toHaveBeenCalledWith('post-already-there', [], expect.anything())
    expect(mockPublishPost).toHaveBeenCalledWith('post-already-there')
  })

  it('remembers the server id the moment it has one, so a later crash cannot duplicate the post', async () => {
    await queuePost(database, { caption: 'x', visibility: 'public', media: [] })
    mockUploadPostMedia.mockRejectedValueOnce(networkError())

    await drainPostOutbox(database)

    const [row] = await rowsFor(database)
    expect(row.postUuid).toBe('post-uuid-new')
    expect(row.state).toBe('queued')
  })

  it('leaves an entry waiting, untouched, when the network is simply not there', async () => {
    await queuePost(database, { caption: 'x', visibility: 'public', media: [] })
    mockCreatePost.mockRejectedValueOnce(networkError())

    const outcome = await drainPostOutbox(database)

    expect(outcome).toEqual({ attempted: 1, published: 0, failed: 0, networkFailure: true })
    const [row] = await rowsFor(database)
    expect(row.state).toBe('queued')
    expect(row.attempts).toBe(0)
    expect(row.lastError).toBeNull()
  })

  it('stops after the first network failure rather than hammering the radio', async () => {
    await queuePost(database, { caption: 'one', visibility: 'public', media: [] })
    await queuePost(database, { caption: 'two', visibility: 'public', media: [] })
    mockCreatePost.mockRejectedValue(networkError())

    const outcome = await drainPostOutbox(database)

    expect(outcome.attempted).toBe(1)
    expect(mockCreatePost).toHaveBeenCalledTimes(1)
  })

  it('marks an entry failed, with the server’s own words, when the server refuses it', async () => {
    await queuePost(database, { caption: 'x', visibility: 'public', media: [] })
    mockCreatePost.mockRejectedValueOnce(rejection(422, 'The caption is too long.'))

    const outcome = await drainPostOutbox(database)

    expect(outcome).toEqual({ attempted: 1, published: 0, failed: 1, networkFailure: false })
    const [row] = await rowsFor(database)
    expect(row.state).toBe('failed')
    expect(row.attempts).toBe(1)
    expect(row.lastError).toBe('The caption is too long.')
  })

  it('never publishes a post whose photos did not all get there', async () => {
    await queuePost(database, {
      caption: 'x',
      visibility: 'public',
      media: [{ uri: 'file:///cache/photo.jpg', fileName: 'photo.jpg' }],
    })
    mockUploadPostMedia.mockRejectedValueOnce(rejection(413, 'That photo is too big.'))

    await drainPostOutbox(database)

    expect(mockPublishPost).not.toHaveBeenCalled()
    const [row] = await rowsFor(database)
    expect(row.state).toBe('failed')
    expect(row.lastError).toBe('That photo is too big.')
  })

  it('leaves failed entries alone until somebody presses Retry', async () => {
    await queuePost(database, { caption: 'x', visibility: 'public', media: [] })
    mockCreatePost.mockRejectedValueOnce(rejection(422, 'no'))
    await drainPostOutbox(database)

    jest.clearAllMocks()
    const outcome = await drainPostOutbox(database)

    expect(outcome.attempted).toBe(0)
    expect(mockCreatePost).not.toHaveBeenCalled()
  })

  it('gives each photo a key that stays the same across attempts', async () => {
    const id = await queuePost(database, {
      caption: 'x',
      visibility: 'public',
      media: [{ uri: 'file:///cache/a.jpg' }, { uri: 'file:///cache/b.jpg' }],
    })

    await drainPostOutbox(database)

    const options = mockUploadPostMedia.mock.calls[0][2] as {
      idempotencyKeyFor: (index: number) => string
    }
    expect(options.idempotencyKeyFor(0)).toBe(`${id}-0`)
    expect(options.idempotencyKeyFor(1)).toBe(`${id}-1`)
  })
})
