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
import {
  createTestDatabase,
  markSynced,
  seedCity,
  seedExplorerProfile,
  seedSpot,
} from '../support/testDatabase'
import type ExplorerProfile from '@/db/models/ExplorerProfile'
import type Follow from '@/db/models/Follow'
import type Review from '@/db/models/Review'
import type Spot from '@/db/models/Spot'
import type WishlistItem from '@/db/models/WishlistItem'

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
    const spot = await seedSpot(database, {
      uuid: 'spot-fallback',
      cityId: 41,
      cityUuid: 'city-not-local',
    })

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

    expect(row).toEqual({
      uuid: 'review-1',
      spot_uuid: 'spot-reviewed',
      rating: 5,
      body: 'Worth the hike.',
    })
  })

  it('omits a cleared nullable field on a created row (nothing to clear yet)', async () => {
    const database = createTestDatabase()
    const spot = await seedSpot(database, { uuid: 'spot-blank-description' })

    const row = await serializeForPush(database, 'sto_spots', spot, 'created')

    expect('description' in row).toBe(false)
  })

  it("sends an explicit null for a cleared nullable field on an updated row, so SpotUpdateRequest's sometimes|nullable rule actually clears the column", async () => {
    const database = createTestDatabase()
    const spot = await seedSpot(database, { uuid: 'spot-cleared-description' })
    await markSynced(database, spot)
    await database.write(async () => {
      await spot.update((row: any) => {
        row._raw.description = null
      })
    })

    const row = await serializeForPush(database, 'sto_spots', spot, 'updated')

    expect(row.description).toBeNull()
  })

  it('sends spot_uuid for a wishlist item, resolved from the numeric spot_id (WishlistStoreRequest.php:34)', async () => {
    const database = createTestDatabase()
    await seedSpot(database, { uuid: 'spot-wishlisted', serverId: 21 })
    const item = await database.write(async () =>
      database.get<WishlistItem>('sto_wishlist_items').create((row: any) => {
        row._raw.id = 'wishlist-1'
        row._raw.uuid = 'wishlist-1'
        row._raw.spot_id = 21
        row._raw.note = 'Bring water'
        row._raw.is_downloaded_offline = true
        row._raw.created_at = 1
        row._raw.updated_at = 1
      }),
    )

    const row = await serializeForPush(database, 'sto_wishlist_items', item)

    expect(row).toEqual({
      uuid: 'wishlist-1',
      spot_uuid: 'spot-wishlisted',
      note: 'Bring water',
      is_downloaded_offline: true,
    })
  })

  it('sends user_uuid for a follow, from the local-only followee_uuid column (FollowStoreRequest.php:34)', async () => {
    const database = createTestDatabase()
    const follow = await database.write(async () =>
      database.get<Follow>('sto_follows').create((row: any) => {
        row._raw.id = 'follow-1'
        row._raw.uuid = 'follow-1'
        row._raw.followee_uuid = 'user-followed'
        row._raw.status = 'active'
        row._raw.created_at = 1
        row._raw.updated_at = 1
      }),
    )

    const row = await serializeForPush(database, 'sto_follows', follow)

    expect(row).toEqual({ uuid: 'follow-1', user_uuid: 'user-followed' })
  })

  it('sends every writable profile field EXCEPT the two privacy switches', async () => {
    const database = createTestDatabase()
    await seedCity(database, { uuid: 'city-home', serverId: 5 })
    const profile = await database.write(async () =>
      database.get<ExplorerProfile>('sto_explorer_profiles').create((row: any) => {
        row._raw.id = 'profile-1'
        row._raw.uuid = 'profile-1'
        row._raw.home_city_id = 5
        row._raw.username = 'trailblazer'
        row._raw.bio = 'I hike.'
        row._raw.website = 'https://example.com'
        row._raw.interests = JSON.stringify(['hiking', 'coffee'])
        row._raw.spots_count = 0
        row._raw.followers_count = 0
        row._raw.following_count = 0
        row._raw.is_private = false
        row._raw.shows_location_on_spots = true
        row._raw.created_at = 1
        row._raw.updated_at = 1
      }),
    )

    const row = await serializeForPush(database, 'sto_explorer_profiles', profile)

    // STOURIFY-243. `is_private` and `shows_location_on_spots` are deliberately
    // absent: nothing in the app edits them offline, so the local copy is only
    // ever as fresh as the last pull, and sending it can undo a switch the user
    // just turned off in Settings. Both are `sometimes|boolean` on the server's
    // ProfileUpdateRequest, so leaving them out means "do not change this".
    expect(row).toEqual({
      uuid: 'profile-1',
      username: 'trailblazer',
      bio: 'I hike.',
      website: 'https://example.com',
      interests: ['hiking', 'coffee'],
      home_city_uuid: 'city-home',
    })
  })

  /**
   * The bug this card exists for, in one test (STOURIFY-243).
   *
   * The user turns Private account ON in Settings, which saves straight over
   * the network and never touches the offline database — so the local row is
   * left saying `is_private: false`. Then onboarding saves an interest, which
   * marks that same local row as needing a push. Before the fix the push
   * carried the stale `false` and the server dutifully switched privacy back
   * off. Now the field simply is not in the payload, so it cannot.
   */
  it('does not carry a stale privacy value that would undo the Settings save', async () => {
    const database = createTestDatabase()
    const profile = await seedExplorerProfile(database, { uuid: 'profile-stale' })
    await markSynced(database, profile)

    // What persistProfileChoice does when the local row already exists: write
    // an onboarding answer, which marks the whole row as needing a push.
    await database.write(async () => {
      await profile.update((row: any) => {
        row._setRaw('interests', JSON.stringify(['coffee']))
      })
    })

    const batch = await collectDirtyBatch(database, new Set())
    const [pushed] = batch.envelope.sto_explorer_profiles.updated

    expect(pushed).not.toHaveProperty('is_private')
    expect(pushed).not.toHaveProperty('shows_location_on_spots')
    expect(pushed).toMatchObject({ uuid: 'profile-stale', interests: ['coffee'] })
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
    // The highest-stakes case in this task: a deleted row must not ALSO
    // appear in `created`/`updated` with a serialized payload — deletes are
    // uuid-only, nothing else.
    expect(batch.envelope.sto_spots.created).toEqual([])
    expect(batch.envelope.sto_spots.updated).toEqual([])
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

    await upsertSyncFailure(database, {
      recordId: 'spot-1',
      tableName: 'sto_spots',
      reason: 'error',
      lastError: 'boom',
    })
    await upsertSyncFailure(database, {
      recordId: 'spot-1',
      tableName: 'sto_spots',
      reason: 'error',
      lastError: 'boom again',
    })

    const failures = await listSyncFailures(database)

    expect(failures).toHaveLength(1)
    expect(failures[0].attempts).toBe(2)
    expect(failures[0].lastError).toBe('boom again')
  })

  it('excludes validation and forbidden rows from the next drain, but not error rows', async () => {
    const database = createTestDatabase()

    await upsertSyncFailure(database, {
      recordId: 'spot-v',
      tableName: 'sto_spots',
      reason: 'validation',
      lastError: 'title required',
    })
    await upsertSyncFailure(database, {
      recordId: 'spot-f',
      tableName: 'sto_spots',
      reason: 'forbidden',
      lastError: 'not yours',
    })
    await upsertSyncFailure(database, {
      recordId: 'spot-e',
      tableName: 'sto_spots',
      reason: 'error',
      lastError: 'duplicate key',
    })

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
    await upsertSyncFailure(database, {
      recordId: 'spot-v',
      tableName: 'sto_spots',
      reason: 'validation',
      lastError: 'title required',
    })

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
