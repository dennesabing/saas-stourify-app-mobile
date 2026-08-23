import { Q, type Database } from '@nozbe/watermelondb'
import PostOutboxModel from '@/db/models/PostOutbox'
import type { DraftMedia } from '@/db/models/PostDraft'
import { copyDraftPhotos, deleteDraftPhotos } from '@/features/social/api/draftPhotoStore'
import { deleteDraftRow } from '@/features/social/api/postDrafts'

/** Everything a post is made of, at the moment Share was pressed. */
export interface QueuedPostContent {
  caption: string
  visibility: string
  spotUuid?: string | null
  spotTitle?: string | null
  media: DraftMedia[]
}

/**
 * Puts a post in the box (STOURIFY-161).
 *
 * Called when **Share** was pressed and the request came back with no
 * response at all — a tunnel, a lift, aeroplane mode. The post is written down
 * whole and `sync/postOutboxDrain.ts` sends it the next time the app reaches
 * the server.
 *
 * Two options, and both exist because Share can fail at different points:
 *
 * - `draftId` — where the post came from, if the author had been drafting.
 *   That draft row is deleted, because a post that is on its way is not
 *   something you can still edit, and two copies in two places is how one post
 *   gets shared twice. Its photo **files** stay: this entry inherits them.
 * - `postUuid` — set when the server had already accepted the post before the
 *   signal died, so the drain carries on instead of creating a second one.
 */
export async function queuePost(
  database: Database,
  content: QueuedPostContent,
  options: { draftId?: string | null; postUuid?: string | null } = {},
): Promise<string> {
  const now = Date.now()
  const collection = database.get<PostOutboxModel>('post_outbox')

  const created = await database.write(async () =>
    collection.create((row: any) => {
      row._raw.caption = content.caption
      row._raw.visibility = content.visibility
      row._raw.spot_uuid = content.spotUuid ?? null
      row._raw.spot_title = content.spotTitle ?? null
      row._raw.media = JSON.stringify(content.media)
      row._raw.post_uuid = options.postUuid ?? null
      row._raw.state = 'queued'
      row._raw.attempts = 0
      row._raw.last_error = null
      row._raw.created_at = now
    }),
  )

  // The copies are named after whatever owns them, and the row's id only
  // exists once the row does — so the copy happens here and the row is
  // corrected in place, exactly as `saveDraft` does it. A photo already in our
  // own folder (which is every photo that came from a draft) is left alone.
  const media = await copyDraftPhotos(created.id, content.media)
  await database.write(async () => {
    await created.update((row: any) => {
      row._raw.media = JSON.stringify(media)
    })
  })

  // Last, and only once the entry is safely written. Deleting the draft first
  // would mean a failure in between loses the author's words entirely — which
  // is the one thing this whole family of cards exists to prevent.
  if (options.draftId != null) await deleteDraftRow(database, options.draftId)

  return created.id
}

/**
 * Everything still waiting, oldest first.
 *
 * Oldest first because a queue is a queue: the post somebody wrote an hour ago
 * should not sit behind the one they wrote a minute ago. `failed` entries are
 * left out — only a person pressing Retry moves one of those back.
 */
export async function listQueuedPosts(database: Database): Promise<PostOutboxModel[]> {
  const rows = await database
    .get<PostOutboxModel>('post_outbox')
    .query(Q.where('state', 'queued'))
    .fetch()

  return rows.slice().sort((a, b) => a.createdAt - b.createdAt)
}

async function findQueued(database: Database, id: string): Promise<PostOutboxModel | null> {
  try {
    return await database.get<PostOutboxModel>('post_outbox').find(id)
  } catch {
    return null
  }
}

/**
 * Puts a failed entry back in the queue, so the next drain tries it again.
 *
 * An entry that is already gone is a success: the queue screen and a drain can
 * both be holding the same id.
 */
export async function retryQueuedPost(database: Database, id: string): Promise<void> {
  const row = await findQueued(database, id)
  if (row === null) return

  await database.write(async () => {
    await row.update((r: any) => {
      r._setRaw('state', 'queued')
      r._setRaw('last_error', null)
    })
  })
}

/**
 * Throws a queued post away — the entry **and** its photo copies.
 *
 * The row alone is not enough. These bytes were never uploaded anywhere, so
 * leaving them behind fills the phone with pictures nothing will ever read;
 * that is the documented failure mode of the media outbox's own discard.
 */
export async function discardQueuedPost(database: Database, id: string): Promise<void> {
  const row = await findQueued(database, id)
  if (row === null) return

  const media = row.media

  await database.write(async () => {
    await row.destroyPermanently()
  })

  await deleteDraftPhotos(media)
}
