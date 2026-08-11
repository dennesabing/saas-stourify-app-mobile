import type { Database, Model } from '@nozbe/watermelondb'
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs'
import { createDatabase } from '@/db'
import { stourifySchema } from '@/db/schema'
import { stourifyMigrations } from '@/db/migrations'
import type City from '@/db/models/City'
import type ExplorerProfile from '@/db/models/ExplorerProfile'
import type Spot from '@/db/models/Spot'

/**
 * A brand-new in-memory database, isolated from every other test.
 *
 * LokiJS runs in Node, which is why the whole sync layer is testable under jest
 * with no device and no native module — only the Task 1 native spike needs
 * hardware.
 *
 * This is the ONLY place a `LokiJSAdapter` may be constructed. It always passes
 * `extraLokiOptions: { autosave: false }` — the adapter defaults to
 * `autosave: true`, which starts a 500ms `setInterval` internally
 * (`@nozbe/watermelondb/adapters/lokijs/worker/lokiExtensions.js:96-101`) that
 * keeps the Node event loop open forever. Without this flag jest never exits;
 * it looks exactly like an infinite loop in the code under test. Later tasks
 * must call `createTestDatabase()` instead of building their own adapter.
 */
export function createTestDatabase(): Database {
  return createDatabase(
    new LokiJSAdapter({
      schema: stourifySchema,
      migrations: stourifyMigrations,
      useWebWorker: false,
      useIncrementalIndexedDB: false,
      extraLokiOptions: { autosave: false },
    }),
  )
}

export interface SpotSeed {
  uuid: string
  serverId: number | null
  cityId: number | null
  cityUuid: string | null
  title: string
  latitude: number
  longitude: number
  status: string
}

const SPOT_DEFAULTS: SpotSeed = {
  uuid: 'spot-uuid',
  serverId: null,
  cityId: null,
  cityUuid: null,
  title: 'Seeded Spot',
  latitude: 6.1164,
  longitude: 125.1716,
  status: 'draft',
}

/** Creates a spot in `_status: 'created'` — the state a local offline write leaves it in. */
export async function seedSpot(database: Database, overrides: Partial<SpotSeed> = {}): Promise<Spot> {
  const seed: SpotSeed = { ...SPOT_DEFAULTS, ...overrides }

  return database.write(async () =>
    database.get<Spot>('sto_spots').create((row: any) => {
      row._raw.id = seed.uuid
      row._raw.uuid = seed.uuid
      row._raw.server_id = seed.serverId
      row._raw.city_id = seed.cityId
      row._raw.city_uuid = seed.cityUuid
      row._raw.title = seed.title
      row._raw.latitude = seed.latitude
      row._raw.longitude = seed.longitude
      row._raw.status = seed.status
      row._raw.is_verified = false
      row._raw.reviews_count = 0
      row._raw.saves_count = 0
      row._raw.created_at = 1_700_000_000_000
      row._raw.updated_at = 1_700_000_000_000
    }),
  )
}

export interface CitySeed {
  uuid: string
  serverId: number
  name: string
  slug: string
  /** Both optional on the server, so both are nullable here — a city with no
   *  coordinates is a real row, not a broken one. */
  latitude: number | null
  longitude: number | null
}

const CITY_DEFAULTS: CitySeed = {
  uuid: 'city-uuid',
  serverId: 1,
  name: 'General Santos',
  slug: 'general-santos',
  latitude: null,
  longitude: null,
}

export async function seedCity(database: Database, overrides: Partial<CitySeed> = {}): Promise<City> {
  const seed: CitySeed = { ...CITY_DEFAULTS, ...overrides }

  return database.write(async () =>
    database.get<City>('sto_cities').create((row: any) => {
      row._raw.id = seed.uuid
      row._raw.uuid = seed.uuid
      row._raw.server_id = seed.serverId
      row._raw.name = seed.name
      row._raw.slug = seed.slug
      row._raw.latitude = seed.latitude
      row._raw.longitude = seed.longitude
      row._raw.spot_count = 0
      row._raw.is_featured = false
      row._raw.created_at = 1_700_000_000_000
      row._raw.updated_at = 1_700_000_000_000
    }),
  )
}

export interface ExplorerProfileSeed {
  uuid: string
  serverId: number
  userId: number
  username: string
  interests: string[]
  homeCityId: number | null
}

const EXPLORER_PROFILE_DEFAULTS: ExplorerProfileSeed = {
  uuid: 'profile-uuid',
  serverId: 1,
  userId: 1,
  username: 'ana',
  interests: [],
  homeCityId: null,
}

/** Seeds the caller's own explorer profile — the local table pulls scope to exactly one row. */
export async function seedExplorerProfile(
  database: Database,
  overrides: Partial<ExplorerProfileSeed> = {},
): Promise<ExplorerProfile> {
  const seed: ExplorerProfileSeed = { ...EXPLORER_PROFILE_DEFAULTS, ...overrides }

  return database.write(async () =>
    database.get<ExplorerProfile>('sto_explorer_profiles').create((row: any) => {
      row._raw.id = seed.uuid
      row._raw.uuid = seed.uuid
      row._raw.server_id = seed.serverId
      row._raw.user_id = seed.userId
      row._raw.home_city_id = seed.homeCityId
      row._raw.username = seed.username
      row._raw.interests = JSON.stringify(seed.interests)
      row._raw.spots_count = 0
      row._raw.followers_count = 0
      row._raw.following_count = 0
      row._raw.is_private = false
      row._raw.shows_location_on_spots = true
      row._raw.created_at = 1_700_000_000_000
      row._raw.updated_at = 1_700_000_000_000
    }),
  )
}

/**
 * Clears a record's dirty flags without marking it dirty again.
 *
 * Assigning `_raw` directly inside the updater is what the sync engine itself
 * does (`syncEngine.ts:55`): it bypasses `_setRaw`, so no per-field change
 * marking runs and `_status` sticks.
 */
export async function markSynced(database: Database, record: Model): Promise<void> {
  await database.write(async () => {
    await record.update((row: any) => {
      row._raw._status = 'synced'
      row._raw._changed = ''
    })
  })
}
