import { Q, type Database } from '@nozbe/watermelondb'
import type { Observable } from 'rxjs'
import PostDraftModel, { type DraftMedia } from '@/db/models/PostDraft'
import { copyDraftPhotos, deleteDraftPhotos } from '@/features/social/api/draftPhotoStore'

/** What the compose screen holds, and therefore what a draft is made of. */
export interface DraftContent {
  caption: string
  visibility: string
  spotUuid?: string | null
  spotTitle?: string | null
  media: DraftMedia[]
}

/**
 * The visibility a brand-new post starts on (STOURIFY-105).
 *
 * It is here as well as on the compose screen because "has the author changed
 * anything?" below has to know what *unchanged* looks like.
 */
export const DEFAULT_VISIBILITY = 'private'

/**
 * Has the author actually done anything worth keeping?
 *
 * A photo is not enough on its own. You cannot reach the compose screen
 * without having picked one, so counting it would write a draft every time
 * somebody opened the screen and changed their mind — and a Drafts page that
 * is mostly abandoned openings is a page nobody looks at.
 *
 * Words, a tagged spot, or a deliberately changed audience are all things a
 * person did on purpose and would be annoyed to lose.
 */
export function isWorthSaving(content: DraftContent): boolean {
  return (
    content.caption.trim() !== '' ||
    (content.spotUuid ?? null) !== null ||
    content.visibility !== DEFAULT_VISIBILITY
  )
}

/**
 * Writes the draft down — creating it the first time, updating it after that.
 *
 * Returns the draft's id, which the caller keeps so the next save lands on the
 * same row. Without that, every debounce tick would leave another copy behind.
 */
export async function saveDraft(
  database: Database,
  content: DraftContent,
  draftId?: string | null,
): Promise<string> {
  const now = Date.now()
  const collection = database.get<PostDraftModel>('post_drafts')

  const existing = draftId != null ? await findDraft(database, draftId) : null

  if (existing !== null) {
    // The photos are copied into storage this app owns before the row points at
    // them; the picker's address is in a folder the system empties at will
    // (STOURIFY-160). Already-copied photos cost nothing here.
    const media = await copyDraftPhotos(existing.id, content.media)

    await database.write(async () => {
      await existing.update((row: any) => {
        row._raw.caption = content.caption
        row._raw.visibility = content.visibility
        row._raw.spot_uuid = content.spotUuid ?? null
        row._raw.spot_title = content.spotTitle ?? null
        row._raw.media = JSON.stringify(media)
        row._raw.updated_at = now
      })
    })
    return existing.id
  }

  const created = await database.write(async () =>
    collection.create((row: any) => {
      row._raw.caption = content.caption
      row._raw.visibility = content.visibility
      row._raw.spot_uuid = content.spotUuid ?? null
      row._raw.spot_title = content.spotTitle ?? null
      row._raw.media = JSON.stringify(content.media)
      row._raw.created_at = now
      row._raw.updated_at = now
    }),
  )

  // A new draft's id only exists once the row does, and the copies are named
  // after it — so the copy happens here and the row is corrected in place. The
  // window in between is one write on the same device, and what it holds is the
  // picker's address, which is what the draft would have held anyway.
  const media = await copyDraftPhotos(created.id, content.media)
  await database.write(async () => {
    await created.update((row: any) => {
      row._raw.media = JSON.stringify(media)
    })
  })

  return created.id
}

/**
 * One draft by id, or `null`.
 *
 * WatermelonDB's `find` throws for an id it does not hold, and "the draft is
 * gone" is an ordinary thing here — it may have been deleted on the Drafts
 * page while the compose screen was still open. A null is easier to be right
 * about than a thrown error every caller has to remember to catch.
 */
export async function findDraft(
  database: Database,
  draftId: string,
): Promise<PostDraftModel | null> {
  try {
    return await database.get<PostDraftModel>('post_drafts').find(draftId)
  } catch {
    return null
  }
}

/**
 * Every draft, most recently touched first — what the Drafts page renders.
 *
 * `observeWithColumns`, not a plain `observe`, and the difference is not
 * academic. A plain `observe` re-emits when a row is ADDED or REMOVED and says
 * nothing when one is merely edited — so a Drafts page left open behind the
 * compose screen went on showing the caption and the "Last edited" time from
 * before the edit, and looked correct again the moment anybody navigated away
 * and back. Naming `updated_at` makes an edit an event, and every save touches
 * that column. Found on a real device, not in a test.
 */
export function observeDrafts(database: Database): Observable<PostDraftModel[]> {
  return database
    .get<PostDraftModel>('post_drafts')
    .query(Q.sortBy('updated_at', Q.desc))
    .observeWithColumns(['updated_at'])
}

/**
 * Throws a draft away.
 *
 * Deleting one that is already gone is a success, not an error: the Drafts
 * page and a compose screen can both be holding the same id.
 */
export async function deleteDraft(database: Database, draftId: string): Promise<void> {
  const draft = await findDraft(database, draftId)
  if (draft === null) return

  // The files as well as the row. Skipping the file half does not fail
  // anything; it just fills the phone with copies nothing will ever read.
  const media = draft.media

  await database.write(async () => {
    await draft.destroyPermanently()
  })

  await deleteDraftPhotos(media)
}

/**
 * Deletes the draft row and **keeps** its photo copies.
 *
 * The one caller is `queuePost`, when a post the author pressed Share on with
 * no signal moves from the Drafts page into the send-later queue. The queue
 * entry points at the very same files, so deleting them here would leave a
 * post on its way with no picture.
 *
 * It is deliberately a second function rather than a flag on `deleteDraft`.
 * Which of the two you want is a fact about why the draft is going away, and a
 * boolean argument at the call site says nothing about that to whoever reads
 * it next.
 */
export async function deleteDraftRow(database: Database, draftId: string): Promise<void> {
  const draft = await findDraft(database, draftId)
  if (draft === null) return

  await database.write(async () => {
    await draft.destroyPermanently()
  })
}
