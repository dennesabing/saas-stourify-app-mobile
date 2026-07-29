import { stourifySchema, SYNCED_TABLES } from '@/db/schema'
import delta from '../fixtures/m2a-delta.json'

/** The server's own allowlist, transcribed from SyncSerializer::COLUMNS. */
const SERVER_COLUMNS: Record<string, string[]> = {
  sto_spots: [
    'id', 'uuid', 'organization_id', 'user_id', 'city_id', 'owner_user_id',
    'title', 'slug', 'description', 'latitude', 'longitude', 'address',
    'categories', 'hours', 'status', 'is_verified',
    'rating_average', 'reviews_count', 'saves_count',
    'created_at', 'updated_at', 'deleted_at',
  ],
  sto_reviews: [
    'id', 'uuid', 'organization_id', 'user_id', 'spot_id',
    'rating', 'body', 'helpful_count',
    'created_at', 'updated_at', 'deleted_at',
  ],
  sto_wishlist_items: [
    'id', 'uuid', 'organization_id', 'user_id', 'spot_id', 'city_id',
    'note', 'is_downloaded_offline',
    'created_at', 'updated_at',
  ],
  sto_follows: [
    'id', 'uuid', 'organization_id', 'follower_id', 'followee_id',
    'status', 'accepted_at',
    'created_at', 'updated_at',
  ],
  sto_explorer_profiles: [
    'id', 'uuid', 'organization_id', 'user_id', 'home_city_id',
    'username', 'bio', 'website', 'interests',
    'spots_count', 'followers_count', 'following_count',
    'is_private', 'shows_location_on_spots',
    'created_at', 'updated_at',
  ],
  sto_cities: [
    'id', 'uuid', 'organization_id',
    'name', 'slug', 'region', 'country', 'latitude', 'longitude',
    'spot_count', 'is_featured',
    'created_at', 'updated_at', 'deleted_at',
  ],
}

function columnNames(table: string): string[] {
  return Object.keys(stourifySchema.tables[table].columns)
}

describe('the local schema against the server allowlist', () => {
  it('declares the six synced tables under the server names, verbatim', () => {
    // The engine matches delta keys to table names by exact string and silently
    // skips a table it cannot find (syncEngine.ts:74-76) — a rename never errors,
    // it just never syncs.
    expect(SYNCED_TABLES).toEqual([
      'sto_spots',
      'sto_reviews',
      'sto_wishlist_items',
      'sto_follows',
      'sto_explorer_profiles',
      'sto_cities',
    ])
    for (const table of SYNCED_TABLES) {
      expect(stourifySchema.tables[table]).toBeDefined()
    }
  })

  it.each(Object.keys(SERVER_COLUMNS))('covers every serializer column for %s', (table) => {
    const local = columnNames(table)
    for (const column of SERVER_COLUMNS[table]) {
      // The server's `id` is stored as `server_id`; everything else is 1:1.
      const expected = column === 'id' ? 'server_id' : column
      expect(local).toContain(expected)
    }
  })

  it.each(Object.keys(SERVER_COLUMNS))('declares uuid and server_id on %s', (table) => {
    expect(columnNames(table)).toContain('uuid')
    expect(stourifySchema.tables[table].columns.server_id.type).toBe('number')
  })

  it('declares the local-only companion uuid columns the push envelope needs', () => {
    expect(columnNames('sto_spots')).toContain('city_uuid')
    expect(columnNames('sto_reviews')).toContain('spot_uuid')
    expect(columnNames('sto_wishlist_items')).toContain('spot_uuid')
    expect(columnNames('sto_follows')).toContain('followee_uuid')
  })

  it('declares no column the serializer does not emit, apart from the local-only set', () => {
    const localOnly = new Set(['server_id', 'city_uuid', 'spot_uuid', 'followee_uuid'])
    for (const [table, serverColumns] of Object.entries(SERVER_COLUMNS)) {
      for (const column of columnNames(table)) {
        if (localOnly.has(column)) continue
        expect(serverColumns).toContain(column)
      }
    }
  })

  it('declares the local-only sync_failures table, which is not synced', () => {
    expect(SYNCED_TABLES).not.toContain('sync_failures')
    expect(columnNames('sync_failures').sort()).toEqual(
      ['attempts', 'failed_at', 'last_error', 'reason', 'record_id', 'table_name'].sort(),
    )
  })

  it('is at schema version 2, carrying the pending_media migration', () => {
    expect(stourifySchema.version).toBe(2)
  })

  it('declares the local-only pending_media table, which is not synced', () => {
    expect(SYNCED_TABLES).not.toContain('pending_media')
    expect(columnNames('pending_media').sort()).toEqual(
      [
        'attempts',
        'created_at',
        'filename',
        'host_type',
        'host_uuid',
        'last_error',
        'local_path',
        'mime',
        'size',
        'state',
      ].sort(),
    )
  })

  it('can hold every row shape the real delta fixture actually returned', () => {
    for (const table of SYNCED_TABLES) {
      const rows = (delta as Record<string, any>)[table].created as Record<string, unknown>[]
      for (const row of rows) {
        for (const column of Object.keys(row)) {
          const expected = column === 'id' ? 'server_id' : column
          expect(columnNames(table)).toContain(expected)
        }
      }
    }
  })
})
