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

/** Omits a key entirely when its value is null/undefined — for fields with no `nullable` rule. */
function put(row: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== null && value !== undefined) row[key] = value
}

/**
 * For fields the server's `*UpdateRequest` marks `sometimes|nullable` (spot
 * `description`/`address`/`city_uuid`/`categories`/`hours`, review `body`,
 * wishlist `note`, profile `bio`/`website`/`interests`/`home_city_uuid`).
 *
 * On an **update**, `sometimes` means "absent key leaves the column
 * unchanged" — so clearing a nullable field locally MUST send an explicit
 * `null`, or the server keeps the stale value forever while the local row
 * flips to `synced` and looks successful. On a **create** there is no prior
 * value to preserve, so a null field is simply omitted (absent and null are
 * equivalent there, and omitting keeps the payload smaller).
 */
function putNullable(row: Record<string, unknown>, key: string, value: unknown, op: PushOp): void {
  if (value !== null && value !== undefined) {
    row[key] = value
    return
  }
  if (op === 'updated') row[key] = null
}

/**
 * Builds one push row from a local record — the fields the server's FormRequests
 * actually accept, and nothing else.
 *
 * `op` defaults to `'created'` (omit-null semantics) for callers — like
 * ad-hoc test calls — that don't care about the update-clears-a-field case;
 * `collectDirtyBatch` always passes the record's real `_status`.
 */
export async function serializeForPush(
  database: Database,
  table: string,
  record: Model,
  op: PushOp = 'created',
): Promise<Record<string, unknown>> {
  if (table === 'sto_spots') {
    const spot = record as Spot
    const row: Record<string, unknown> = { uuid: spot.uuid, title: spot.title }
    putNullable(row, 'description', spot.description, op)
    row.latitude = spot.latitude
    row.longitude = spot.longitude
    putNullable(row, 'address', spot.address, op)
    // SpotStoreRequest.php:40 / SpotUpdateRequest.php:40 validate `city_uuid`;
    // `city_id` is never accepted.
    putNullable(
      row,
      'city_uuid',
      (await resolveUuidByServerId(database, 'sto_cities', spot.cityId)) ?? spot.cityUuid,
      op,
    )
    putNullable(row, 'categories', spot.categories.length > 0 ? spot.categories : null, op)
    putNullable(row, 'hours', spot.hours, op)
    put(row, 'status', spot.status)
    return row
  }

  if (table === 'sto_reviews') {
    const review = record as Review
    const row: Record<string, unknown> = { uuid: review.uuid }
    put(row, 'spot_uuid', (await resolveUuidByServerId(database, 'sto_spots', review.spotId)) ?? review.spotUuid)
    row.rating = review.rating
    putNullable(row, 'body', review.body, op)
    return row
  }

  if (table === 'sto_wishlist_items') {
    const item = record as WishlistItem
    const row: Record<string, unknown> = { uuid: item.uuid }
    put(row, 'spot_uuid', (await resolveUuidByServerId(database, 'sto_spots', item.spotId)) ?? item.spotUuid)
    putNullable(row, 'note', item.note, op)
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
    putNullable(row, 'bio', profile.bio, op)
    putNullable(row, 'website', profile.website, op)
    putNullable(row, 'interests', profile.interests.length > 0 ? profile.interests : null, op)
    row.is_private = profile.isPrivate
    // ProfileUpdateRequest.php:58 — `sometimes|boolean`, never nullable, so it
    // is always sent, like `is_private`.
    row.shows_location_on_spots = profile.showsLocationOnSpots
    putNullable(
      row,
      'home_city_uuid',
      await resolveUuidByServerId(database, 'sto_cities', profile.homeCityId),
      op,
    )
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

      const status = (record._raw as Record<string, unknown>)._status as PushOp
      const row = await serializeForPush(database, table, record, status)

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
