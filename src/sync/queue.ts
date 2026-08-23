import { Q, type Database, type Model } from '@nozbe/watermelondb'
import { File } from 'expo-file-system'
import type ExplorerProfile from '@/db/models/ExplorerProfile'
import type PendingMedia from '@/db/models/PendingMedia'
import type PostOutbox from '@/db/models/PostOutbox'
import type Review from '@/db/models/Review'
import type Spot from '@/db/models/Spot'
import type SyncFailure from '@/db/models/SyncFailure'
import { clearSyncFailure } from './pushService'
import { PUSHABLE_TABLES } from './syncConfig'

export type QueueOp = 'created' | 'updated' | 'deleted'

export interface PendingQueueRow {
  /** The local record id — which is the row's uuid. */
  id: string
  tableName: string
  op: QueueOp
  icon: string
  title: string
  meta: string
}

export interface FailedQueueRow {
  id: string
  tableName: string
  reason: string
  attempts: number
  lastError: string
  icon: string
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
  icon: string
  /** Lower-case, used mid-sentence: "New spot · …", "Deleted spot". */
  noun: string
}

const TABLE_COPY: Record<string, TableCopy> = {
  sto_spots: { icon: '📍', noun: 'spot' },
  sto_reviews: { icon: '✏️', noun: 'review' },
  sto_wishlist_items: { icon: '🔖', noun: 'wishlist item' },
  sto_follows: { icon: '👤', noun: 'follow' },
  sto_explorer_profiles: { icon: '🙍', noun: 'profile' },
}

const FALLBACK_COPY: TableCopy = { icon: '📄', noun: 'change' }

function copyFor(tableName: string): TableCopy {
  return TABLE_COPY[tableName] ?? FALLBACK_COPY
}

/** The human name of a record, when it has one worth showing. */
function nameOf(tableName: string, record: Model): string | null {
  if (tableName === 'sto_spots') return (record as Spot).title || null
  if (tableName === 'sto_reviews') return `${(record as Review).rating}★`
  if (tableName === 'sto_explorer_profiles') return (record as ExplorerProfile).username || null

  // Follows and wishlist items reference a spot/user by id only; there is no
  // local title to resolve without a join that would be wrong as often as it
  // is right (the referenced row may not be synced down yet).
  return null
}

function titleFor(tableName: string, op: QueueOp, record: Model | null): string {
  const { noun } = copyFor(tableName)

  if (op === 'deleted') return `Deleted ${noun}`

  const prefix = op === 'created' ? 'New ' : ''
  const label = op === 'created' ? `${prefix}${noun}` : noun.charAt(0).toUpperCase() + noun.slice(1)
  const name = record === null ? null : nameOf(tableName, record)

  return name === null ? label : `${label} · ${name}`
}

const OP_VERB: Record<QueueOp, string> = {
  created: 'create',
  updated: 'update',
  deleted: 'delete',
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
      const op = ((record._raw as Record<string, unknown>)._status as QueueOp) ?? 'updated'

      rows.push({
        id: record.id,
        tableName,
        op,
        icon: copyFor(tableName).icon,
        title: titleFor(tableName, op, record),
        meta: `Queued to ${OP_VERB[op]}`,
        sortKey: ((record._raw as Record<string, unknown>).created_at as number) ?? 0,
      })
    }

    for (const id of await database.adapter.getDeletedRecords(tableName)) {
      rows.push({
        id,
        tableName,
        op: 'deleted',
        icon: copyFor(tableName).icon,
        title: titleFor(tableName, 'deleted', null),
        meta: 'Queued to delete',
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
      record === null
        ? 'deleted'
        : (((record._raw as Record<string, unknown>)._status as QueueOp) ?? 'updated')

    rows.push({
      id: failure.recordId,
      tableName: failure.tableName,
      reason: failure.reason,
      attempts: failure.attempts,
      lastError: failure.lastError,
      icon: copyFor(failure.tableName).icon,
      title: titleFor(failure.tableName, op, record),
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
  const rows = await database.get<PendingMedia>('pending_media').query(Q.where('state', 'pending')).fetch()

  return rows
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((row) => ({
      id: row.id,
      tableName: 'pending_media',
      op: 'created' as QueueOp,
      icon: '📷',
      title: `Photo · ${row.filename}`,
      meta: 'Queued to upload',
    }))
}

export async function listFailedMediaQueue(database: Database): Promise<FailedQueueRow[]> {
  const rows = await database.get<PendingMedia>('pending_media').query(Q.where('state', 'failed')).fetch()

  return rows.map((row) => ({
    id: row.id,
    tableName: 'pending_media',
    reason: row.lastError ?? 'The server rejected this photo.',
    attempts: row.attempts,
    lastError: row.lastError ?? '',
    icon: '📷',
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
      icon: '📝',
      title: titleForQueuedPost(row.caption),
      meta: 'Waiting for a signal',
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
    icon: '📝',
    title: titleForQueuedPost(row.caption),
    meta: `Rejected: ${row.lastError ?? 'The server rejected this post.'} · ${row.attempts} attempt${
      row.attempts === 1 ? '' : 's'
    }`,
  }))
}
