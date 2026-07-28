import { Q } from '@nozbe/watermelondb'
import type Spot from '@/db/models/Spot'
import type SyncFailure from '@/db/models/SyncFailure'
import type ExplorerProfile from '@/db/models/ExplorerProfile'
import {
  discardRecord,
  listFailedQueue,
  listPendingQueue,
  retryAllFailures,
  retryRecord,
} from '@/sync/queue'
import { upsertSyncFailure } from '@/sync/pushService'
import { createTestDatabase, markSynced, seedSpot } from '../support/testDatabase'

it('lists a locally created spot as a pending create', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1', title: 'Hidden Cove' })

  const rows = await listPendingQueue(database)

  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    id: 'spot-1',
    tableName: 'sto_spots',
    op: 'created',
    icon: '📍',
    title: 'New spot · Hidden Cove',
    meta: 'Queued to create',
  })
})

it('ignores rows that are already synced', async () => {
  const database = createTestDatabase()
  const spot = await seedSpot(database, { uuid: 'spot-1' })
  await markSynced(database, spot)

  expect(await listPendingQueue(database)).toHaveLength(0)
})

it('lists an edited synced row as a pending update', async () => {
  const database = createTestDatabase()
  const spot = await seedSpot(database, { uuid: 'spot-1', title: 'Old' })
  await markSynced(database, spot)

  await database.write(async () => {
    await spot.update((row: any) => {
      row._setRaw('title', 'New name')
    })
  })

  const rows = await listPendingQueue(database)
  expect(rows).toHaveLength(1)
  expect(rows[0].op).toBe('updated')
  expect(rows[0].title).toBe('Spot · New name')
  expect(rows[0].meta).toBe('Queued to update')
})

it('lists a pending deletion even though the record is gone', async () => {
  const database = createTestDatabase()
  const spot = await seedSpot(database, { uuid: 'spot-1' })
  await markSynced(database, spot)

  await database.write(async () => {
    await spot.markAsDeleted()
  })

  const rows = await listPendingQueue(database)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    id: 'spot-1',
    op: 'deleted',
    title: 'Deleted spot',
    meta: 'Queued to delete',
  })
})

it('names a profile row by its username', async () => {
  const database = createTestDatabase()

  await database.write(async () =>
    database.get<ExplorerProfile>('sto_explorer_profiles').create((row: any) => {
      row._raw.id = 'profile-1'
      row._raw.uuid = 'profile-1'
      row._raw.username = 'wanderer'
      row._raw.is_private = false
      row._raw.shows_location_on_spots = true
      row._raw.created_at = 1
      row._raw.updated_at = 1
    }),
  )

  const rows = await listPendingQueue(database)
  expect(rows[0].title).toBe('New profile · wanderer')
  expect(rows[0].icon).toBe('🙍')
})

it('lists failures with the server reason, attempts and message', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1', title: 'Hidden Cove' })
  await upsertSyncFailure(database, {
    recordId: 'spot-1',
    tableName: 'sto_spots',
    reason: 'validation',
    lastError: JSON.stringify({ title: ['The title field is required.'] }),
  })

  const rows = await listFailedQueue(database)

  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    id: 'spot-1',
    reason: 'validation',
    attempts: 1,
    title: 'New spot · Hidden Cove',
  })
  expect(rows[0].meta).toBe('Rejected: The title field is required. · 1 attempt')
})

it('falls back to the raw error text when it is not a validation bag', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1' })
  await upsertSyncFailure(database, {
    recordId: 'spot-1',
    tableName: 'sto_spots',
    reason: 'forbidden',
    lastError: 'You do not own this spot.',
  })

  const rows = await listFailedQueue(database)
  expect(rows[0].meta).toBe('Rejected: You do not own this spot. · 1 attempt')
})

it('pluralizes attempts', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1' })
  await upsertSyncFailure(database, {
    recordId: 'spot-1', tableName: 'sto_spots', reason: 'error', lastError: '{}',
  })
  await upsertSyncFailure(database, {
    recordId: 'spot-1', tableName: 'sto_spots', reason: 'error', lastError: '{}',
  })

  const rows = await listFailedQueue(database)
  expect(rows[0].attempts).toBe(2)
  expect(rows[0].meta).toContain('· 2 attempts')
})

it('a failed row still appears once in the pending list', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1' })
  await upsertSyncFailure(database, {
    recordId: 'spot-1', tableName: 'sto_spots', reason: 'validation', lastError: '{}',
  })

  // It is still dirty — the failure is a diagnostic overlay, not a move.
  expect(await listPendingQueue(database)).toHaveLength(1)
})

it('retryRecord clears the failure so the next drain picks the row up', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1' })
  await upsertSyncFailure(database, {
    recordId: 'spot-1', tableName: 'sto_spots', reason: 'validation', lastError: '{}',
  })

  await retryRecord(database, 'spot-1')

  expect(await listFailedQueue(database)).toHaveLength(0)
  expect(await listPendingQueue(database)).toHaveLength(1)
})

it('discardRecord destroys the row permanently and leaves NO delete to push', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1' })
  await upsertSyncFailure(database, {
    recordId: 'spot-1', tableName: 'sto_spots', reason: 'validation', lastError: '{}',
  })

  await discardRecord(database, 'sto_spots', 'spot-1')

  expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(0)
  expect(await listFailedQueue(database)).toHaveLength(0)
  expect(await listPendingQueue(database)).toHaveLength(0)

  // The assertion that catches a markAsDeleted() regression: a discarded row
  // must leave no tombstone, or the next drain pushes a delete for a record the
  // server never accepted and the gate stays shut.
  expect(await database.adapter.getDeletedRecords('sto_spots')).toHaveLength(0)
})

it('discardRecord works on a row with no failure attached', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1' })

  await discardRecord(database, 'sto_spots', 'spot-1')

  expect(await database.get<Spot>('sto_spots').query().fetchCount()).toBe(0)
})

it('retryAllFailures clears every failure row, blocking or not', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'spot-1' })
  await seedSpot(database, { uuid: 'spot-2' })
  await upsertSyncFailure(database, {
    recordId: 'spot-1', tableName: 'sto_spots', reason: 'validation', lastError: '{}',
  })
  await upsertSyncFailure(database, {
    recordId: 'spot-2', tableName: 'sto_spots', reason: 'error', lastError: '{}',
  })

  await retryAllFailures(database)

  expect(await database.get<SyncFailure>('sync_failures').query().fetchCount()).toBe(0)
  expect(await listPendingQueue(database)).toHaveLength(2)
})

it('sorts the pending queue newest first', async () => {
  const database = createTestDatabase()
  await seedSpot(database, { uuid: 'older', title: 'Older' })
  await seedSpot(database, { uuid: 'newer', title: 'Newer' })

  await database.write(async () => {
    const rows = await database.get<Spot>('sto_spots').query(Q.where('uuid', 'newer')).fetch()
    await rows[0].update((row: any) => {
      row._raw.created_at = 1_800_000_000_000
    })
  })

  const rows = await listPendingQueue(database)
  expect(rows.map((row) => row.id)).toEqual(['newer', 'older'])
})
