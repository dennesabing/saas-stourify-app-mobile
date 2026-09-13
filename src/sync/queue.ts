import { Q, type Database, type Model } from '@nozbe/watermelondb'
import { File } from 'expo-file-system'
import type ExplorerProfile from '@/db/models/ExplorerProfile'
import type PendingMedia from '@/db/models/PendingMedia'
import type PostOutbox from '@/db/models/PostOutbox'
import type Review from '@/db/models/Review'
import type Spot from '@/db/models/Spot'
import type SyncFailure from '@/db/models/SyncFailure'
import type WishlistItem from '@/db/models/WishlistItem'
import { clearSyncFailure } from './pushService'
import { PUSHABLE_TABLES } from './syncConfig'

export type QueueOp = 'created' | 'updated' | 'deleted'

/**
 * What a queued change IS, in the person's terms — which icon tile the Sync
 * status screen draws beside it (STOURIFY-294). Not the table: a save and a
 * review are different things to the person who made them, whatever they are
 * stored as.
 */
export type QueueKind =
  'spot' | 'review' | 'wishlist' | 'follow' | 'profile' | 'photo' | 'post' | 'change'

export interface PendingQueueRow {
  /** The local record id — which is the row's uuid. */
  id: string
  tableName: string
  op: QueueOp
  kind: QueueKind
  title: string
  meta: string
}

export interface FailedQueueRow {
  id: string
  tableName: string
  reason: string
  attempts: number
  lastError: string
  kind: QueueKind
  title: string
  meta: string
}

/**
 * The tables the screen's subscription watches: every pushable table plus the
 * three local-only ones — failures, the photo outbox, and the send-later post
 * queue. `sto_cities` is excluded — it is pull-only reference data and can
 * never be queued (`syncConfig.ts:24-34`).
 */
export const QUEUE_TABLES: readonly string[] = [
  ...PUSHABLE_TABLES,
  'sync_failures',
  'pending_media',
  'post_outbox',
]

interface TableCopy {
  kind: QueueKind
  /** Lower-case, used mid-sentence: "New spot · …", "Deleted spot". */
  noun: string
}

const TABLE_COPY: Record<string, TableCopy> = {
  sto_spots: { kind: 'spot', noun: 'spot' },
  sto_reviews: { kind: 'review', noun: 'review' },
  sto_wishlist_items: { kind: 'wishlist', noun: 'wishlist item' },
  sto_follows: { kind: 'follow', noun: 'follow' },
  sto_explorer_profiles: { kind: 'profile', noun: 'profile' },
}

const FALLBACK_COPY: TableCopy = { kind: 'change', noun: 'change' }

function copyFor(tableName: string): TableCopy {
  return TABLE_COPY[tableName] ?? FALLBACK_COPY
}

function rawOf(record: Model): Record<string, unknown> {
  return record._raw as Record<string, unknown>
}

/**
 * A spot's title as this phone has it, or `null`. By uuid first — what a local
 * write carries — then by the server's numeric id, which is all an older row
 * may have. The spot can simply not be here yet (never opened, not synced
 * down), and the caller then names the change without it.
 */
async function localSpotTitle(
  database: Database,
  spotUuid: string | null,
  spotId: number | null,
): Promise<string | null> {
  const clause =
    spotUuid !== null
      ? Q.where('uuid', spotUuid)
      : spotId !== null
        ? Q.where('server_id', spotId)
        : null
  if (clause === null) return null

  const [spot] = await database.get<Spot>('sto_spots').query(clause).fetch()
  return spot?.title || null
}

/**
 * The human name of a record, when it has one worth showing (STOURIFY-294).
 *
 * A review and a save are named by the SPOT they are about — "Review · Tuna
 * Corner Grill" — because that is what the person remembers doing. A save uses
 * the copy of its spot it kept when it was made (STOURIFY-207) before looking
 * for the spot itself, because that copy is there precisely for when nothing
 * else is.
 */
async function nameOf(
  database: Database,
  tableName: string,
  record: Model,
): Promise<string | null> {
  switch (tableName) {
    case 'sto_spots':
      return (record as Spot).title || null
    case 'sto_reviews': {
      const review = record as Review
      return localSpotTitle(database, review.spotUuid, review.spotId)
    }
    case 'sto_wishlist_items': {
      const item = record as WishlistItem
      const kept = item.spotSnapshot?.title
      return kept ? kept : localSpotTitle(database, item.spotUuid, item.spotId)
    }
    case 'sto_explorer_profiles':
      return (record as ExplorerProfile).username || null
    default:
      // A follow references a user by id only, and there is no local name to
      // resolve without a join that would be wrong as often as it is right.
      return null
  }
}

function titleFor(tableName: string, op: QueueOp, name: string | null): string {
  const { kind, noun } = copyFor(tableName)

  if (op === 'deleted') return kind === 'wishlist' ? 'Removed a saved spot' : `Deleted ${noun}`

  // The design's own wording for these two: what you did, then the spot.
  if (kind === 'wishlist') return name === null ? 'Saved a spot' : `Saved · ${name}`
  if (kind === 'review') {
    if (name !== null) return `Review · ${name}`
    return op === 'created' ? 'New review' : 'Review'
  }

  const label = op === 'created' ? `New ${noun}` : noun.charAt(0).toUpperCase() + noun.slice(1)
  return name === null ? label : `${label} · ${name}`
}

/**
 * The muted line under a waiting row — the design's "3 photos · created
 * offline", "★★★★★ · written offline".
 *
 * It says "waiting to send" rather than "offline": the app cannot tell whether
 * a change was made with the radio off, and a write made with it on also waits
 * for the next cycle (STOURIFY-316), so "offline" would sometimes be false.
 */
async function detailFor(
  database: Database,
  tableName: string,
  op: QueueOp,
  record: Model,
): Promise<string> {
  if (tableName === 'sto_spots') {
    const photos = await database
      .get<PendingMedia>('pending_media')
      .query(Q.where('host_uuid', rawOf(record).uuid as string), Q.where('state', 'pending'))
      .fetchCount()
    if (photos > 0) return `${photos} photo${photos === 1 ? '' : 's'} · waiting to send`
  }

  if (tableName === 'sto_reviews') {
    const rating = (record as Review).rating
    if (rating > 0) return `${'★'.repeat(rating)} · waiting to send`
  }

  return op === 'updated' ? 'Edited · waiting to send' : 'Waiting to send'
}

/**
 * Every locally-dirty row, across every pushable table, plus pending deletions.
 *
 * Reads the database directly rather than `useSyncStatusStore.pendingCount`:
 * that counter is written only inside a sync cycle (`cycle.ts:42-45`), so an
 * offline write leaves it at zero while rows sit unsent. See the design spec §3.
 */
export async function listPendingQueue(database: Database): Promise<PendingQueueRow[]> {
  const rows: (PendingQueueRow & { sortKey: number })[] = []

  for (const tableName of PUSHABLE_TABLES) {
    const dirty = await database
      .get(tableName)
      .query(Q.where('_status', Q.notEq('synced')))
      .fetch()

    for (const record of dirty) {
      const op = (rawOf(record)._status as QueueOp) ?? 'updated'

      rows.push({
        id: record.id,
        tableName,
        op,
        kind: copyFor(tableName).kind,
        title: titleFor(tableName, op, await nameOf(database, tableName, record)),
        meta: await detailFor(database, tableName, op, record),
        sortKey: (rawOf(record).created_at as number) ?? 0,
      })
    }

    for (const id of await database.adapter.getDeletedRecords(tableName)) {
      rows.push({
        id,
        tableName,
        op: 'deleted',
        kind: copyFor(tableName).kind,
        title: titleFor(tableName, 'deleted', null),
        meta: 'Waiting to send',
        sortKey: 0,
      })
    }
  }

  rows.sort((a, b) => b.sortKey - a.sortKey)

  return rows.map(({ sortKey: _sortKey, ...row }) => row)
}

/**
 * Turns the server's stored error into one readable sentence.
 *
 * `applyPushResults` stores `JSON.stringify(result.errors ?? {})` — a Laravel
 * validation bag (`pushService.ts:361-366`). Anything else (a plain string, an
 * empty bag) is passed through, because an unreadable diagnostic is still worth
 * more to a user than "something went wrong".
 */
export function describeFailure(lastError: string): string {
  let parsed: unknown

  try {
    parsed = JSON.parse(lastError)
  } catch {
    return lastError.trim() === '' ? 'The server rejected this change.' : lastError
  }

  if (parsed === null || typeof parsed !== 'object') {
    return String(parsed)
  }

  const messages = Object.values(parsed as Record<string, unknown>).flatMap((value) =>
    Array.isArray(value) ? value.map(String) : [String(value)],
  )

  return messages.length > 0 ? messages.join(' ') : 'The server rejected this change.'
}

export async function listFailedQueue(database: Database): Promise<FailedQueueRow[]> {
  const failures = await database.get<SyncFailure>('sync_failures').query().fetch()
  const rows: FailedQueueRow[] = []

  for (const failure of failures) {
    let record: Model | null = null

    try {
      record = await database.get(failure.tableName).find(failure.recordId)
    } catch {
      // The row can be gone — discarded on another screen, or destroyed by an
      // ack race. The failure is still worth showing; it just loses its name.
      record = null
    }

    const op: QueueOp =
      record === null ? 'deleted' : ((rawOf(record)._status as QueueOp) ?? 'updated')
    const name = record === null ? null : await nameOf(database, failure.tableName, record)

    rows.push({
      id: failure.recordId,
      tableName: failure.tableName,
      reason: failure.reason,
      attempts: failure.attempts,
      lastError: failure.lastError,
      kind: copyFor(failure.tableName).kind,
      title: titleFor(failure.tableName, op, name),
      meta: `Rejected: ${describeFailure(failure.lastError)} · ${failure.attempts} attempt${
        failure.attempts === 1 ? '' : 's'
      }`,
    })
  }

  return rows
}

/**
 * Clears the exclusion so the next drain sends the row again.
 *
 * The row itself is untouched — it is still dirty, so `collectDirtyBatch` picks
 * it up naturally once it is no longer in the excluded set
 * (`pushService.ts:239-243, 274`). There is no separate retry push path.
 */
export async function retryRecord(database: Database, recordId: string): Promise<void> {
  await clearSyncFailure(database, recordId)
}

/**
 * The escape hatch for a write the server will never accept.
 *
 * `destroyPermanently()`, NEVER `markAsDeleted()`: the server never accepted
 * this record, so there is nothing there to delete. `markAsDeleted` would queue
 * a delete push that gets rejected in turn, leaving the skip-pull gate shut —
 * the exact stall this screen exists to break (`cycle.ts:58-64`).
 */
export async function discardRecord(
  database: Database,
  tableName: string,
  recordId: string,
): Promise<void> {
  await clearSyncFailure(database, recordId)

  let record: Model
  try {
    record = await database.get(tableName).find(recordId)
  } catch {
    return
  }

  await database.write(async () => {
    await record.destroyPermanently()
  })
}

/**
 * Clears EVERY failure row, not only the blocking ones.
 *
 * A non-blocking `error` failure is a stale diagnostic from a previous attempt;
 * leaving it behind makes "Needs your attention" keep accusing a row that the
 * retry just sent successfully.
 */
export async function retryAllFailures(database: Database): Promise<void> {
  const failures = await database.get<SyncFailure>('sync_failures').query().fetch()

  await database.write(async () => {
    for (const failure of failures) {
      await failure.destroyPermanently()
    }
  })
}

// -----------------------------------------------------------------------------
// pending_media — the M2c Sync Status screen's own section (design spec §2.4)
// -----------------------------------------------------------------------------

/**
 * Shaped to fit `SyncQueueRow`'s existing `pending`/`failed` props exactly, so
 * the screen reuses the component rather than growing a media-specific one.
 * `tableName` is always `'pending_media'` — never one of `PUSHABLE_TABLES` —
 * which is how the screen's action handlers tell a photo row apart from a
 * row-edit row and route to `retryMediaRow`/`discardMediaRow` instead of
 * `retryRecord`/`discardRecord`.
 */
export async function listPendingMediaQueue(database: Database): Promise<PendingQueueRow[]> {
  const rows = await database
    .get<PendingMedia>('pending_media')
    .query(Q.where('state', 'pending'))
    .fetch()

  return rows
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((row) => ({
      id: row.id,
      tableName: 'pending_media',
      op: 'created' as QueueOp,
      kind: 'photo' as QueueKind,
      title: `Photo · ${row.filename}`,
      meta: 'Waiting to upload',
    }))
}

export async function listFailedMediaQueue(database: Database): Promise<FailedQueueRow[]> {
  const rows = await database
    .get<PendingMedia>('pending_media')
    .query(Q.where('state', 'failed'))
    .fetch()

  return rows.map((row) => ({
    id: row.id,
    tableName: 'pending_media',
    reason: row.lastError ?? 'The server rejected this photo.',
    attempts: row.attempts,
    lastError: row.lastError ?? '',
    kind: 'photo' as QueueKind,
    title: `Photo · ${row.filename}`,
    meta: `Rejected: ${row.lastError ?? 'The server rejected this photo.'} · ${row.attempts} attempt${
      row.attempts === 1 ? '' : 's'
    }`,
  }))
}

/** Resets a failed photo back to `pending` so the next media drain retries it. */
export async function retryMediaRow(database: Database, id: string): Promise<void> {
  const row = await database.get<PendingMedia>('pending_media').find(id)

  await database.write(async () => {
    await row.update((r: any) => {
      r._setRaw('state', 'pending')
      r._setRaw('last_error', null)
    })
  })
}

/**
 * Deletes BOTH the row and its local file. The row alone is not enough — the
 * server never received these bytes, so leaving the copy in `media-outbox/`
 * behind is a storage leak nothing else will ever clean up (design spec §2.4).
 */
export async function discardMediaRow(database: Database, id: string): Promise<void> {
  const row = await database.get<PendingMedia>('pending_media').find(id)
  const path = row.localPath

  await database.write(async () => {
    await row.destroyPermanently()
  })

  try {
    const file = new File(path)
    if (file.exists) file.delete()
  } catch {
    // Already gone — nothing left to clean up.
  }
}

/**
 * The send-later post queue, as rows the Sync status screen can draw
 * (STOURIFY-161).
 *
 * `tableName` is always `'post_outbox'` — never one of `PUSHABLE_TABLES` and
 * never `'pending_media'` — which is how the screen's handlers tell a waiting
 * post apart from a photo and from a row edit, and route to
 * `retryQueuedPost`/`discardQueuedPost`.
 */
const POST_OUTBOX_TABLE = 'post_outbox'

/**
 * What to call a post in a list.
 *
 * The caption if there is one, because that is what the author will recognise;
 * just "New post" if there is not. A queue entry with no name at all reads as a
 * bug rather than as a post somebody wrote no words for.
 */
function titleForQueuedPost(caption: string): string {
  const trimmed = caption.trim()
  if (trimmed === '') return 'New post'

  // Long enough to recognise, short enough not to wrap the row into a wall.
  const shortened = trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed
  return `New post · ${shortened}`
}

export async function listPendingPostQueue(database: Database): Promise<PendingQueueRow[]> {
  const rows = await database
    .get<PostOutbox>(POST_OUTBOX_TABLE)
    .query(Q.where('state', 'queued'))
    .fetch()

  return rows
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((row) => ({
      id: row.id,
      tableName: POST_OUTBOX_TABLE,
      op: 'created' as QueueOp,
      kind: 'post' as QueueKind,
      title: titleForQueuedPost(row.caption),
      // The spot it is tagged at, when there is one — the one other thing
      // somebody would recognise it by (STOURIFY-294).
      meta: row.spotTitle ? `${row.spotTitle} · waiting for a signal` : 'Waiting for a signal',
    }))
}

export async function listFailedPostQueue(database: Database): Promise<FailedQueueRow[]> {
  const rows = await database
    .get<PostOutbox>(POST_OUTBOX_TABLE)
    .query(Q.where('state', 'failed'))
    .fetch()

  return rows.map((row) => ({
    id: row.id,
    tableName: POST_OUTBOX_TABLE,
    reason: row.lastError ?? 'The server rejected this post.',
    attempts: row.attempts,
    lastError: row.lastError ?? '',
    kind: 'post' as QueueKind,
    title: titleForQueuedPost(row.caption),
    meta: `Rejected: ${row.lastError ?? 'The server rejected this post.'} · ${row.attempts} attempt${
      row.attempts === 1 ? '' : 's'
    }`,
  }))
}
