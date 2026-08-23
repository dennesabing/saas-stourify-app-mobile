import { Database, appSchema, tableSchema } from '@nozbe/watermelondb'
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs'
import { createDatabase } from '@/db'
import { stourifySchema } from '@/db/schema'
import { stourifyMigrations } from '@/db/migrations'
import SpotModel from '@/db/models/Spot'
import SyncFailureModel from '@/db/models/SyncFailure'
import type Spot from '@/db/models/Spot'
import type PendingMedia from '@/db/models/PendingMedia'
import PendingMediaModel from '@/db/models/PendingMedia'
import type PostDraft from '@/db/models/PostDraft'

/**
 * The pre-migration schema: version 1, `pending_media` absent — a snapshot
 * of what shipped before this task, kept local to this test only.
 */
const schemaV1 = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'sto_spots',
      columns: [
        { name: 'uuid', type: 'string', isIndexed: true },
        {
          name: 'server_id',
          type: 'number',
          isOptional: true,
          isIndexed: true,
        },
        { name: 'organization_id', type: 'number', isOptional: true },
        { name: 'user_id', type: 'number', isOptional: true },
        { name: 'city_id', type: 'number', isOptional: true },
        { name: 'city_uuid', type: 'string', isOptional: true },
        { name: 'owner_user_id', type: 'number', isOptional: true },
        { name: 'title', type: 'string' },
        { name: 'slug', type: 'string', isOptional: true },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'latitude', type: 'number' },
        { name: 'longitude', type: 'number' },
        { name: 'address', type: 'string', isOptional: true },
        { name: 'categories', type: 'string', isOptional: true },
        { name: 'hours', type: 'string', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'is_verified', type: 'boolean' },
        { name: 'rating_average', type: 'number', isOptional: true },
        { name: 'reviews_count', type: 'number' },
        { name: 'saves_count', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'deleted_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'sync_failures',
      columns: [
        { name: 'record_id', type: 'string', isIndexed: true },
        { name: 'table_name', type: 'string' },
        { name: 'reason', type: 'string' },
        { name: 'attempts', type: 'number' },
        { name: 'last_error', type: 'string' },
        { name: 'failed_at', type: 'number' },
      ],
    }),
  ],
})

describe('v1 -> v2 migration (adds pending_media)', () => {
  it('preserves existing rows and adds the new table — not a destructive reset', async () => {
    // Open a v1 database (no migrations needed — it's a fresh install at v1)
    // and write a row, the way a real un-drained offline write would exist
    // on a device before this app update ships.
    const v1Adapter = new LokiJSAdapter({
      schema: schemaV1,
      useWebWorker: false,
      useIncrementalIndexedDB: false,
      extraLokiOptions: { autosave: false },
    })
    // A minimal Database over just the two tables schemaV1 declares — the
    // real app's full `modelClasses` doesn't apply here, since this is
    // standing in for a pre-migration install that only ever knew about
    // `sto_spots` and `sync_failures`.
    const v1Database = new Database({
      adapter: v1Adapter,
      modelClasses: [SpotModel, SyncFailureModel],
    })

    await v1Database.write(async () =>
      v1Database.get<Spot>('sto_spots').create((row: any) => {
        row._raw.id = 'spot-uuid-migrated'
        row._raw.uuid = 'spot-uuid-migrated'
        row._raw.title = 'Un-drained Offline Spot'
        row._raw.latitude = 6.1164
        row._raw.longitude = 125.1716
        row._raw.status = 'draft'
        row._raw.is_verified = false
        row._raw.reviews_count = 0
        row._raw.saves_count = 0
        row._raw.created_at = 1_700_000_000_000
        row._raw.updated_at = 1_700_000_000_000
      }),
    )

    expect(await v1Database.get('sto_spots').query().fetchCount()).toBe(1)

    // `extraLokiOptions: { autosave: false }` (required so jest can exit —
    // see testDatabase.ts) means Loki's own `close()` — which `testClone()`
    // calls — won't flush to the persistence adapter on its own; it only
    // does that when a save is already dirty-pending under autosave. Force
    // one explicit save so the clone actually sees this data, the way a real
    // app (autosave on, or an explicit flush on backgrounding) would.
    await new Promise<void>((resolve, reject) => {
      const driver = (v1Adapter as any)._driver
      driver.loki.saveDatabase((error: unknown) => (error ? reject(error) : resolve()))
    })

    // Re-open the SAME underlying Loki store at v2, with the real app
    // migrations wired in — this is the moment an app update runs on a
    // device with existing data.
    const v2Adapter: any = await v1Adapter.testClone({
      schema: stourifySchema,
      migrations: stourifyMigrations,
    })
    const v2Database = createDatabase(v2Adapter)

    const survivingSpots = await v2Database.get<Spot>('sto_spots').query().fetch()
    expect(survivingSpots).toHaveLength(1)
    expect(survivingSpots[0].title).toBe('Un-drained Offline Spot')

    // The new table exists and is writable post-migration.
    const pendingMedia = await v2Database.write(async () =>
      v2Database.get<PendingMedia>('pending_media').create((row: any) => {
        row._raw.host_type = 'stourify_spot'
        row._raw.host_uuid = 'spot-uuid-migrated'
        row._raw.local_path = 'file:///media-outbox/1.jpg'
        row._raw.filename = 'photo.jpg'
        row._raw.mime = 'image/jpeg'
        row._raw.size = 12345
        row._raw.state = 'pending'
        row._raw.attempts = 0
        row._raw.created_at = 1_700_000_000_000
      }),
    )
    expect(pendingMedia.hostUuid).toBe('spot-uuid-migrated')
  })
})

/**
 * The v2 schema as it shipped: `pending_media` present, `post_drafts` absent.
 * Minimal, like `schemaV1` above — it stands in for an installed app, so it
 * only needs the tables this test actually writes to.
 */
const schemaV2 = appSchema({
  version: 2,
  tables: [
    tableSchema({
      name: 'pending_media',
      columns: [
        { name: 'host_type', type: 'string' },
        { name: 'host_uuid', type: 'string', isIndexed: true },
        { name: 'local_path', type: 'string' },
        { name: 'filename', type: 'string' },
        { name: 'mime', type: 'string' },
        { name: 'size', type: 'number' },
        { name: 'state', type: 'string', isIndexed: true },
        { name: 'attempts', type: 'number' },
        { name: 'last_error', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
})

describe('v2 -> v3 migration (adds post_drafts)', () => {
  it('keeps un-drained offline media and adds the new table', async () => {
    const v2Adapter = new LokiJSAdapter({
      schema: schemaV2,
      useWebWorker: false,
      useIncrementalIndexedDB: false,
      extraLokiOptions: { autosave: false },
    })
    const v2Database = new Database({
      adapter: v2Adapter,
      modelClasses: [PendingMediaModel],
    })

    // A photo waiting to be uploaded — the kind of row a destructive schema
    // bump would silently destroy, which is why this has to be a migration.
    await v2Database.write(async () =>
      v2Database.get<PendingMedia>('pending_media').create((row: any) => {
        row._raw.host_type = 'stourify_spot'
        row._raw.host_uuid = 'spot-uuid'
        row._raw.local_path = 'file:///media-outbox/1.jpg'
        row._raw.filename = 'photo.jpg'
        row._raw.mime = 'image/jpeg'
        row._raw.size = 4242
        row._raw.state = 'pending'
        row._raw.attempts = 0
        row._raw.created_at = 1_700_000_000_000
      }),
    )

    await new Promise<void>((resolve, reject) => {
      const driver = (v2Adapter as any)._driver
      driver.loki.saveDatabase((error: unknown) => (error ? reject(error) : resolve()))
    })

    const v3Adapter: any = await v2Adapter.testClone({
      schema: stourifySchema,
      migrations: stourifyMigrations,
    })
    const v3Database = createDatabase(v3Adapter)

    const survivingMedia = await v3Database.get<PendingMedia>('pending_media').query().fetch()
    expect(survivingMedia).toHaveLength(1)
    expect(survivingMedia[0].filename).toBe('photo.jpg')

    const draft = await v3Database.write(async () =>
      v3Database.get<PostDraft>('post_drafts').create((row: any) => {
        row._raw.caption = 'Written before the update'
        row._raw.visibility = 'private'
        row._raw.media = '[]'
        row._raw.created_at = 1_700_000_000_000
        row._raw.updated_at = 1_700_000_000_000
      }),
    )
    expect(draft.caption).toBe('Written before the update')
    expect(draft.media).toEqual([])
  })
})
