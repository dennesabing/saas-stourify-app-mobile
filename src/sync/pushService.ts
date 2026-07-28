import { Q, type Database, type Model } from '@nozbe/watermelondb'
import type ExplorerProfile from '@/db/models/ExplorerProfile'
import type Follow from '@/db/models/Follow'
import type Review from '@/db/models/Review'
import type Spot from '@/db/models/Spot'
import type SyncFailure from '@/db/models/SyncFailure'
import type WishlistItem from '@/db/models/WishlistItem'
import type { SyncFailureSummary } from './status'
import { PUSHABLE_TABLES } from './syncConfig'

export type PushOp = 'created' | 'updated' | 'deleted'

/**
 * Exactly what `SyncController::rejected()` emits (`SyncController.php:190-210,
 * 550-557`). Any other value the server sends is treated as `'error'`.
 */
export type PushRejectionReason = 'validation' | 'forbidden' | 'error'

export interface PushEnvelopeTable {
  created: Record<string, unknown>[]
  updated: Record<string, unknown>[]
  deleted: string[]
}

export type PushEnvelope = Record<string, PushEnvelopeTable>

export interface DirtyBatch {
  envelope: PushEnvelope
  /** uuid → the live record, so an `ok` result can be written back and marked synced. */
  records: Map<string, Model>
  /** table → the uuids sent in `deleted`, so an ack can destroy them permanently. */
  deletedByTable: Record<string, string[]>
  count: number
}

/**
 * Maps a numeric server FK back to the referenced row's uuid.
 *
 * The delta speaks ids; the push speaks uuids. `Q.where('server_id', n)` — never
 * `find(n)` — because the local record id is the row's uuid, not its numeric id.
 */
export async function resolveUuidByServerId(
  database: Database,
  table: string,
  serverId: number | null,
): Promise<string | null> {
  if (serverId === null || serverId === undefined) return null

  const rows = await database.get(table).query(Q.where('server_id', serverId)).fetch()

  return rows.length > 0 ? rows[0].id : null
}

function put(row: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== null && value !== undefined) row[key] = value
}

/**
 * Builds one push row from a local record — the fields the server's FormRequests
 * actually accept, and nothing else.
 */
export async function serializeForPush(
  database: Database,
  table: string,
  record: Model,
): Promise<Record<string, unknown>> {
  if (table === 'sto_spots') {
    const spot = record as Spot
    const row: Record<string, unknown> = { uuid: spot.uuid, title: spot.title }
    put(row, 'description', spot.description)
    row.latitude = spot.latitude
    row.longitude = spot.longitude
    put(row, 'address', spot.address)
    // SpotStoreRequest.php:40 validates `city_uuid`; `city_id` is never accepted.
    put(row, 'city_uuid', (await resolveUuidByServerId(database, 'sto_cities', spot.cityId)) ?? spot.cityUuid)
    put(row, 'categories', spot.categories.length > 0 ? spot.categories : null)
    put(row, 'hours', spot.hours)
    put(row, 'status', spot.status)
    return row
  }

  if (table === 'sto_reviews') {
    const review = record as Review
    const row: Record<string, unknown> = { uuid: review.uuid }
    put(row, 'spot_uuid', (await resolveUuidByServerId(database, 'sto_spots', review.spotId)) ?? review.spotUuid)
    row.rating = review.rating
    put(row, 'body', review.body)
    return row
  }

  if (table === 'sto_wishlist_items') {
    const item = record as WishlistItem
    const row: Record<string, unknown> = { uuid: item.uuid }
    put(row, 'spot_uuid', (await resolveUuidByServerId(database, 'sto_spots', item.spotId)) ?? item.spotUuid)
    put(row, 'note', item.note)
    row.is_downloaded_offline = item.isDownloadedOffline
    return row
  }

  if (table === 'sto_follows') {
    const follow = record as Follow
    // There is no local users table, and `FollowStoreRequest.php:34` wants the
    // followee's user uuid — so the UI stores it on the row at create time.
    return { uuid: follow.uuid, user_uuid: follow.followeeUuid }
  }

  if (table === 'sto_explorer_profiles') {
    const profile = record as ExplorerProfile
    const row: Record<string, unknown> = { uuid: profile.uuid, username: profile.username }
    put(row, 'bio', profile.bio)
    put(row, 'website', profile.website)
    put(row, 'interests', profile.interests.length > 0 ? profile.interests : null)
    row.is_private = profile.isPrivate
    put(row, 'home_city_uuid', await resolveUuidByServerId(database, 'sto_cities', profile.homeCityId))
    return row
  }

  throw new Error(`serializeForPush: ${table} is not pushable`)
}

// -----------------------------------------------------------------------------
// sync_failures — the only state WatermelonDB's dirty tracking does not carry
// -----------------------------------------------------------------------------

async function findFailure(database: Database, recordId: string): Promise<SyncFailure | null> {
  const rows = await database
    .get<SyncFailure>('sync_failures')
    .query(Q.where('record_id', recordId))
    .fetch()

  return rows.length > 0 ? rows[0] : null
}

export async function upsertSyncFailure(
  database: Database,
  input: { recordId: string; tableName: string; reason: PushRejectionReason; lastError: string },
): Promise<void> {
  const existing = await findFailure(database, input.recordId)

  await database.write(async () => {
    if (existing !== null) {
      await existing.update((row: any) => {
        row._setRaw('reason', input.reason)
        row._setRaw('last_error', input.lastError)
        row._setRaw('attempts', existing.attempts + 1)
        row._setRaw('failed_at', Date.now())
      })
      return
    }

    await database.get<SyncFailure>('sync_failures').create((row: any) => {
      row._setRaw('record_id', input.recordId)
      row._setRaw('table_name', input.tableName)
      row._setRaw('reason', input.reason)
      row._setRaw('last_error', input.lastError)
      row._setRaw('attempts', 1)
      row._setRaw('failed_at', Date.now())
    })
  })
}

/** Called when the user edits the row, when they explicitly retry, and on a later `ok`. */
export async function clearSyncFailure(database: Database, recordId: string): Promise<void> {
  const existing = await findFailure(database, recordId)
  if (existing === null) return

  await database.write(async () => {
    await existing.destroyPermanently()
  })
}

export async function listSyncFailures(database: Database): Promise<SyncFailureSummary[]> {
  const rows = await database.get<SyncFailure>('sync_failures').query().fetch()

  return rows.map((row) => ({
    recordId: row.recordId,
    tableName: row.tableName,
    reason: row.reason,
    attempts: row.attempts,
    lastError: row.lastError,
  }))
}

/**
 * The record ids the next drain must skip.
 *
 * A `validation` or `forbidden` rejection stays dirty but is EXCLUDED until the
 * user edits it or explicitly retries. Without this exclusion a permanently
 * invalid row re-pushes every cycle, forever — and because the skip-pull gate
 * blocks the pull on any un-acked row, it would stall all incoming data with no
 * way out.
 */
export async function loadExcludedRecordIds(database: Database): Promise<Set<string>> {
  const rows = await database.get<SyncFailure>('sync_failures').query().fetch()

  return new Set(rows.filter((row) => row.blocksDrain).map((row) => row.recordId))
}

// -----------------------------------------------------------------------------
// The outbox
// -----------------------------------------------------------------------------

/**
 * WatermelonDB's `_status`/`_changed` dirty tracking IS the queue — no payload
 * copy, so a row edited five times offline pushes once, at its latest state.
 * `created`/`updated`/`deleted` map 1:1 onto M2a's buckets, which is exactly why
 * no separate outbox table is needed.
 */
export async function collectDirtyBatch(
  database: Database,
  excluded: ReadonlySet<string>,
): Promise<DirtyBatch> {
  const envelope: PushEnvelope = {}
  const records = new Map<string, Model>()
  const deletedByTable: Record<string, string[]> = {}
  let count = 0

  for (const table of PUSHABLE_TABLES) {
    const dirty = await database
      .get(table)
      .query(Q.where('_status', Q.notEq('synced')))
      .fetch()

    const created: Record<string, unknown>[] = []
    const updated: Record<string, unknown>[] = []

    for (const record of dirty) {
      if (excluded.has(record.id)) continue

      const status = (record._raw as Record<string, unknown>)._status as string
      const row = await serializeForPush(database, table, record)

      if (status === 'created') created.push(row)
      else updated.push(row)

      records.set(record.id, record)
    }

    const deleted = await database.adapter.getDeletedRecords(table)
    const sendableDeleted = deleted.filter((id) => !excluded.has(id))

    if (created.length === 0 && updated.length === 0 && sendableDeleted.length === 0) continue

    envelope[table] = { created, updated, deleted: sendableDeleted }
    deletedByTable[table] = sendableDeleted
    count += created.length + updated.length + sendableDeleted.length
  }

  return { envelope, records, deletedByTable, count }
}

/** The queue depth `status.ts` reports — every dirty row, excluded or not. */
export async function countPending(database: Database): Promise<number> {
  let total = 0

  for (const table of PUSHABLE_TABLES) {
    total += await database.get(table).query(Q.where('_status', Q.notEq('synced'))).fetchCount()
    total += (await database.adapter.getDeletedRecords(table)).length
  }

  return total
}
