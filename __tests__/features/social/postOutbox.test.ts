/**
 * The photo copying is asserted in `draftPhotoStore.test.ts` against a stand-in
 * filesystem. Here it is stubbed, so these tests can say the store is CALLED
 * and go on being about the queue itself — the same arrangement
 * `postDrafts.test.ts` uses.
 */
jest.mock('@/features/social/api/draftPhotoStore', () => ({
  copyDraftPhotos: jest.fn(async (ownerId: string, photos: any[]) =>
    photos.map((photo, index) => ({ ...photo, uri: `file:///kept/${ownerId}-${index}.jpg` })),
  ),
  deleteDraftPhotos: jest.fn(async () => undefined),
}))

import type { Database } from '@nozbe/watermelondb'
import { createTestDatabase } from '../../support/testDatabase'
import { copyDraftPhotos, deleteDraftPhotos } from '@/features/social/api/draftPhotoStore'
import { saveDraft, findDraft } from '@/features/social/api/postDrafts'
import {
  discardQueuedPost,
  listQueuedPosts,
  queuePost,
  retryQueuedPost,
  type QueuedPostContent,
} from '@/features/social/api/postOutbox'
import type PostOutbox from '@/db/models/PostOutbox'

function content(overrides: Partial<QueuedPostContent> = {}): QueuedPostContent {
  return {
    caption: 'Written in a tunnel',
    visibility: 'public',
    spotUuid: null,
    spotTitle: null,
    media: [{ uri: 'file:///cache/photo.jpg', fileName: 'photo.jpg', type: 'image/jpeg' }],
    ...overrides,
  }
}

async function rowsFor(database: Database): Promise<PostOutbox[]> {
  return database.get<PostOutbox>('post_outbox').query().fetch()
}

describe('postOutbox', () => {
  let database: Database

  beforeEach(() => {
    jest.clearAllMocks()
    database = createTestDatabase()
  })

  it('writes one entry holding everything the post is made of', async () => {
    await queuePost(
      database,
      content({ caption: 'No signal here', spotUuid: 'spot-1', spotTitle: 'Hidden Cove' }),
    )

    const rows = await rowsFor(database)
    expect(rows).toHaveLength(1)
    expect(rows[0].caption).toBe('No signal here')
    expect(rows[0].visibility).toBe('public')
    expect(rows[0].spotUuid).toBe('spot-1')
    expect(rows[0].spotTitle).toBe('Hidden Cove')
    expect(rows[0].state).toBe('queued')
    expect(rows[0].attempts).toBe(0)
    expect(rows[0].lastError).toBeNull()
  })

  it('has no server id until one is handed to it', async () => {
    await queuePost(database, content())
    expect((await rowsFor(database))[0].postUuid).toBeNull()

    await queuePost(database, content(), { postUuid: 'post-half-made' })
    const withUuid = (await rowsFor(database)).find((row) => row.postUuid !== null)
    expect(withUuid?.postUuid).toBe('post-half-made')
  })

  it('copies the photos into storage the app owns, so a queued post keeps its picture', async () => {
    const id = await queuePost(database, content())

    expect(copyDraftPhotos).toHaveBeenCalledWith(id, [
      { uri: 'file:///cache/photo.jpg', fileName: 'photo.jpg', type: 'image/jpeg' },
    ])
    expect((await rowsFor(database))[0].media[0].uri).toBe(`file:///kept/${id}-0.jpg`)
  })

  it('takes the draft off the Drafts page, and leaves its photo copies where they are', async () => {
    const draftId = await saveDraft(database, {
      caption: 'Started here',
      visibility: 'public',
      spotUuid: null,
      spotTitle: null,
      media: [{ uri: 'file:///cache/photo.jpg', fileName: 'photo.jpg' }],
    })

    await queuePost(database, content({ caption: 'Started here' }), { draftId })

    // Gone from Drafts — one post lives in one place.
    expect(await findDraft(database, draftId)).toBeNull()
    // But its files are the queue entry's files now, so nothing deleted them.
    expect(deleteDraftPhotos).not.toHaveBeenCalled()
  })

  it('lists what is waiting, oldest first, and leaves failed entries out', async () => {
    // The clock is stepped because three entries made inside one millisecond
    // share a `created_at`, and the order between them is then genuinely
    // arbitrary. Real posts are minutes apart; a test that does not step the
    // clock is asserting something the code never promised.
    const clock = jest.spyOn(Date, 'now')
    clock.mockReturnValue(1_000)
    const first = await queuePost(database, content({ caption: 'first' }))
    clock.mockReturnValue(2_000)
    const second = await queuePost(database, content({ caption: 'second' }))
    clock.mockReturnValue(3_000)
    const third = await queuePost(database, content({ caption: 'third' }))
    clock.mockRestore()

    const failed = await database.get<PostOutbox>('post_outbox').find(second)
    await database.write(async () => {
      await failed.update((row: any) => {
        row._setRaw('state', 'failed')
      })
    })

    const waiting = await listQueuedPosts(database)
    expect(waiting.map((row) => row.id)).toEqual([first, third])
  })

  it('retry puts a failed entry back in the queue and clears what went wrong', async () => {
    const id = await queuePost(database, content())
    const row = await database.get<PostOutbox>('post_outbox').find(id)
    await database.write(async () => {
      await row.update((r: any) => {
        r._setRaw('state', 'failed')
        r._setRaw('last_error', 'The server said no.')
      })
    })

    await retryQueuedPost(database, id)

    const after = await database.get<PostOutbox>('post_outbox').find(id)
    expect(after.state).toBe('queued')
    expect(after.lastError).toBeNull()
  })

  it('discard removes the entry and the photo copies nothing else will ever read', async () => {
    const id = await queuePost(database, content())

    await discardQueuedPost(database, id)

    expect(await rowsFor(database)).toHaveLength(0)
    expect(deleteDraftPhotos).toHaveBeenCalledWith([
      { uri: `file:///kept/${id}-0.jpg`, fileName: 'photo.jpg', type: 'image/jpeg' },
    ])
  })

  it('discarding something already gone is a success, not an error', async () => {
    await expect(discardQueuedPost(database, 'never-existed')).resolves.toBeUndefined()
  })

  it('retrying something already gone is a success, not an error', async () => {
    await expect(retryQueuedPost(database, 'never-existed')).resolves.toBeUndefined()
  })
})
