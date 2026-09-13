import { Q, type Database, type Model } from '@nozbe/watermelondb'
import type WishlistItem from '@/db/models/WishlistItem'
import { isSyncInFlight } from '@/sync/cycle'
import { clearSyncFailure } from '@/sync/pushService'

export interface RemoveLocalWishlistItemTarget {
  /** Every save of this spot on the phone goes — what the spot page knows. */
  spotUuid?: string | null
  /** This one save — what the Wishlist screen knows: the save's own uuid. */
  saveUuid?: string | null
}

export interface RemoveLocalWishlistItemOptions {
  /** Tests pass their own answer; the app asks the sync cycle's latch. */
  isSyncInFlight?: () => boolean
}

/**
 * Unsaves a spot on the phone. NEVER touches the network (STOURIFY-303).
 *
 * Think of a letter. Still on your desk, you bin it and nobody ever knows.
 * Already posted, binning your copy is not enough — you send a second letter
 * saying "ignore the first". A save is the same, and which letter it is decides
 * the call:
 *
 * - **Never sent** (`_status: 'created'`): destroyed outright, the same move
 *   `discardRecord` makes for a write the server never accepted. Nothing is
 *   ever sent for it. `markAsDeleted()` would have queued a delete of a uuid the
 *   server never had — harmless, since the server calls an unknown uuid already
 *   gone, but still a request about a save that must never reach it.
 * - **Already sent**: marked deleted. That mark IS the queued removal:
 *   `collectDirtyBatch` sends every marked uuid under `deleted`, and the ack
 *   destroys it for good.
 * - **Never sent, but a sync is running**: marked deleted too. The push
 *   carrying the save may already be on the wire, and destroying the row would
 *   throw away the only thing that could delete it once the server creates it.
 *   `applyPushResults` keeps the mark when that push's "created" comes back.
 * - **No row at all, but a save uuid**: a save the Wishlist screen got from the
 *   server that this phone never pulled down. A removal marker is written for
 *   it so the next push still deletes it.
 *
 * The "is a sync running" question is asked inside the writer, right before the
 * deletes, with no `await` between them. A cycle raises its latch before it
 * reads anything, so a row destroyed here can never be in a push already
 * collected.
 */
export async function removeLocalWishlistItem(
  database: Database,
  target: RemoveLocalWishlistItemTarget,
  options: RemoveLocalWishlistItemOptions = {},
): Promise<void> {
  const syncInFlight = options.isSyncInFlight ?? isSyncInFlight
  const collection = database.get<WishlistItem>('sto_wishlist_items')

  const clauses: ReturnType<typeof Q.where>[] = []
  if (target.spotUuid) clauses.push(Q.where('spot_uuid', target.spotUuid))
  if (target.saveUuid) clauses.push(Q.where('id', target.saveUuid))
  if (clauses.length === 0) return

  const discarded: string[] = []

  await database.write(async () => {
    const rows = await collection.query(Q.or(...clauses)).fetch()

    if (rows.length === 0) {
      const saveUuid = target.saveUuid
      if (!saveUuid) return

      const now = Date.now()
      const marker = await collection.create((row: any) => {
        row._raw.id = saveUuid
        row._raw.uuid = saveUuid
        row._raw.spot_id = null
        row._raw.spot_uuid = target.spotUuid ?? null
        row._raw.is_downloaded_offline = false
        row._raw.created_at = now
        row._raw.updated_at = now
        // The server has this save, so it starts as sent; the mark below is
        // then an ordinary queued removal.
        row._raw._status = 'synced'
        row._raw._changed = ''
      })
      await marker.markAsDeleted()
      return
    }

    const inFlight = syncInFlight()
    const changes: Model[] = rows.map((row) => {
      if (row.syncStatus === 'created' && !inFlight) {
        discarded.push(row.id)
        return row.prepareDestroyPermanently()
      }
      return row.prepareMarkAsDeleted()
    })
    await database.batch(...changes)
  })

  // A rejection recorded for a save that no longer exists would keep accusing
  // it on the Sync status screen. Outside the writer: this opens its own.
  for (const id of discarded) {
    await clearSyncFailure(database, id)
  }
}
