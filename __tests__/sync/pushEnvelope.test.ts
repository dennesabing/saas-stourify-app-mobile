import {
  clearSyncFailure,
  collectDirtyBatch,
  countPending,
  listSyncFailures,
  loadExcludedRecordIds,
  resolveUuidByServerId,
  serializeForPush,
  upsertSyncFailure,
} from '@/sync/pushService'
import { createTestDatabase, markSynced, seedCity, seedSpot } from '../support/testDatabase'
import type Review from '@/db/models/Review'
import type Spot from '@/db/models/Spot'

describe('resolveUuidByServerId', () => {
  it('maps a numeric server id to the referenced row uuid', async () => {
    const database = createTestDatabase()
    await seedCity(database, { uuid: 'city-7', serverId: 7 })

    expect(await resolveUuidByServerId(database, 'sto_cities', 7)).toBe('city-7')
  })

  it('returns null for an unknown server id', async () => {
    const database = createTestDatabase()

    expect(await resolveUuidByServerId(database, 'sto_cities', 99)).toBeNull()
  })

  it('returns null for a null server id', async () => {
    const database = createTestDatabase()

    expect(await resolveUuidByServerId(database, 'sto_cities', null)).toBeNull()
  })
})

describe('serializeForPush', () => {
  it('sends city_uuid, NOT the numeric city_id the row holds locally', async () => {
    const database = createTestDatabase()
    await seedCity(database, { uuid: 'city-3b2a', serverId: 3 })
    const spot = await seedSpot(database, { uuid: 'spot-9f1c', cityId: 3, title: 'Hidden Cove' })

    const row = await serializeForPush(database, 'sto_spots', spot)

    expect(row.city_uuid).toBe('city-3b2a')
    expect(row.city_id).toBeUndefined()
    expect(row.uuid).toBe('spot-9f1c')
    expect(row.title).toBe('Hidden Cove')
  })

  it('falls back to the local-only city_uuid column when the city is not local', async () => {
    const database = createTestDatabase()
    const spot = await seedSpot(database, { uuid: 'spot-fallback', cityId: 41, cityUuid: 'city-not-local' })

    const row = await serializeForPush(database, 'sto_spots', spot)

    expect(row.city_uuid).toBe('city-not-local')
  })

  it('omits city_uuid entirely when the spot has no city', async () => {
    const database = createTestDatabase()
    const spot = await seedSpot(database, { uuid: 'spot-nocity' })

    const row = await serializeForPush(database, 'sto_spots', spot)

    expect('city_uuid' in row).toBe(false)
  })

  it('sends categories as an array, not as the JSON text the column holds', async () => {
    const database = createTestDatabase()
    const spot = await seedSpot(database, { uuid: 'spot-cat' })
    await database.write(async () => {
      await spot.update((row: any) => {
        row._raw.categories = JSON.stringify(['coast', 'nature'])
      })
    })

    const row = await serializeForPush(database, 'sto_spots', spot)

    expect(row.categories).toEqual(['coast', 'nature'])
  })

  it('sends spot_uuid for a review, resolved from the numeric spot_id', async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-reviewed', serverId: 12 })
    const review = await database.write(async () =>
      database.get<Review>('sto_reviews').create((row: any) => {
        row._raw.id = 'review-1'
        row._raw.uuid = 'review-1'
        row._raw.spot_id = 12
        row._raw.rating = 5
        row._raw.body = 'Worth the hike.'
        row._raw.helpful_count = 0
        row._raw.created_at = 1
        row._raw.updated_at = 1
      }),
    )

    const row = await serializeForPush(database, 'sto_reviews', review)

    expect(row).toEqual({ uuid: 'review-1', spot_uuid: 'spot-reviewed', rating: 5, body: 'Worth the hike.' })
  })
})

describe('collectDirtyBatch', () => {
  it('groups by _status into the buckets M2a expects', async () => {
    const database = createTestDatabase()
    const created = await seedSpot(database, { uuid: 'spot-created', title: 'New' })
    const updated = await seedSpot(database, { uuid: 'spot-updated', title: 'Old' })
    const synced = await seedSpot(database, { uuid: 'spot-synced', title: 'Quiet' })

    await markSynced(database, updated)
    await markSynced(database, synced)
    await database.write(async () => {
      await updated.update((row: Spot) => {
        row._setRaw('title', 'Edited')
      })
    })

    const batch = await collectDirtyBatch(database, new Set())

    expect(batch.envelope.sto_spots.created.map((r) => r.uuid)).toEqual(['spot-created'])
    expect(batch.envelope.sto_spots.updated.map((r) => r.uuid)).toEqual(['spot-updated'])
    expect(batch.envelope.sto_spots.deleted).toEqual([])
    expect(batch.count).toBe(2)
    expect(created.isQueued).toBe(true)
    expect(synced.isQueued).toBe(false)
  })

  it('sends only the uuid for a deleted row', async () => {
    const database = createTestDatabase()
    const spot = await seedSpot(database, { uuid: 'spot-doomed' })
    await markSynced(database, spot)
    await database.write(async () => {
      await spot.markAsDeleted()
    })

    const batch = await collectDirtyBatch(database, new Set())

    expect(batch.envelope.sto_spots.deleted).toEqual(['spot-doomed'])
    expect(batch.deletedByTable.sto_spots).toEqual(['spot-doomed'])
  })

  it('never drains sto_cities, which is not pushable', async () => {
    const database = createTestDatabase()
    await seedCity(database, { uuid: 'city-dirty' })

    const batch = await collectDirtyBatch(database, new Set())

    expect(batch.envelope.sto_cities).toBeUndefined()
    expect(batch.count).toBe(0)
  })

  it('omits a table with nothing dirty, so the envelope stays small', async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-only' })

    const batch = await collectDirtyBatch(database, new Set())

    expect(Object.keys(batch.envelope)).toEqual(['sto_spots'])
  })

  it('excludes a record id in the excluded set', async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-blocked' })
    await seedSpot(database, { uuid: 'spot-ok' })

    const batch = await collectDirtyBatch(database, new Set(['spot-blocked']))

    expect(batch.envelope.sto_spots.created.map((r) => r.uuid)).toEqual(['spot-ok'])
    expect(batch.count).toBe(1)
  })

  it('returns the live records keyed by uuid so results can be applied', async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-keyed' })

    const batch = await collectDirtyBatch(database, new Set())

    expect(batch.records.get('spot-keyed')?.id).toBe('spot-keyed')
  })
})

describe('the sync_failures lifecycle', () => {
  it('creates a failure row, then bumps attempts on the next one', async () => {
    const database = createTestDatabase()

    await upsertSyncFailure(database, { recordId: 'spot-1', tableName: 'sto_spots', reason: 'error', lastError: 'boom' })
    await upsertSyncFailure(database, { recordId: 'spot-1', tableName: 'sto_spots', reason: 'error', lastError: 'boom again' })

    const failures = await listSyncFailures(database)

    expect(failures).toHaveLength(1)
    expect(failures[0].attempts).toBe(2)
    expect(failures[0].lastError).toBe('boom again')
  })

  it('excludes validation and forbidden rows from the next drain, but not error rows', async () => {
    const database = createTestDatabase()

    await upsertSyncFailure(database, { recordId: 'spot-v', tableName: 'sto_spots', reason: 'validation', lastError: 'title required' })
    await upsertSyncFailure(database, { recordId: 'spot-f', tableName: 'sto_spots', reason: 'forbidden', lastError: 'not yours' })
    await upsertSyncFailure(database, { recordId: 'spot-e', tableName: 'sto_spots', reason: 'error', lastError: 'duplicate key' })

    const excluded = await loadExcludedRecordIds(database)

    // A duplicate review or wishlist save surfaces as a unique-constraint
    // `error`, not a field-level `validation` — push runs FormRequest rules()
    // without withValidator() hooks. Retrying is correct: it is idempotent.
    expect(excluded.has('spot-v')).toBe(true)
    expect(excluded.has('spot-f')).toBe(true)
    expect(excluded.has('spot-e')).toBe(false)
  })

  it('clearing a failure puts the row back in the drain', async () => {
    const database = createTestDatabase()
    await upsertSyncFailure(database, { recordId: 'spot-v', tableName: 'sto_spots', reason: 'validation', lastError: 'title required' })

    await clearSyncFailure(database, 'spot-v')

    expect((await loadExcludedRecordIds(database)).size).toBe(0)
    expect(await listSyncFailures(database)).toEqual([])
  })
})

describe('countPending', () => {
  it('counts every dirty row across the pushable tables', async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-a' })
    await seedSpot(database, { uuid: 'spot-b' })
    const synced = await seedSpot(database, { uuid: 'spot-c' })
    await markSynced(database, synced)

    expect(await countPending(database)).toBe(2)
  })
})
