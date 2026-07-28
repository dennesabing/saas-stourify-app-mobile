import {
  DELTA_ENDPOINT,
  PUSHABLE_TABLES,
  PUSH_ENDPOINT,
  STOURIFY_MODULE,
  SYNC_MODULES,
  stourifyModuleConfig,
} from '@/sync/syncConfig'
import { SYNCED_TABLES } from '@/db/schema'
import delta from '../fixtures/m2a-delta.json'

it('declares one module, matching the cursor key the engine writes', () => {
  // The engine's cursor key is per-MODULE: `sync:last_pulled_at:module:${module}`
  // (syncEngine.ts:24). Renaming the module orphans the cursor and forces a
  // silent full re-backfill.
  expect(SYNC_MODULES).toHaveLength(1)
  expect(STOURIFY_MODULE).toBe('stourify')
  expect(stourifyModuleConfig.module).toBe('stourify')
})

it('uses a query-string-free delta endpoint', () => {
  // The engine appends `?since=` directly (syncEngine.ts:69-70) with no
  // query-merge logic; an endpoint that already carries a `?` is a malformed URL.
  expect(DELTA_ENDPOINT).toBe('/stourify/sync/delta')
  expect(DELTA_ENDPOINT).not.toContain('?')
  expect(stourifyModuleConfig.deltaEndpoint).not.toContain('?')
})

it('lists the six server table names verbatim, in registry order', () => {
  expect(stourifyModuleConfig.tables.map((t) => t.table)).toEqual([...SYNCED_TABLES])
})

it('matches every table key the real delta fixture actually returned', () => {
  const configured = new Set(stourifyModuleConfig.tables.map((t) => t.table))
  const returned = Object.keys(delta as Record<string, unknown>).filter((k) => k !== 'server_time')

  // A table the config does not name is silently skipped by the engine
  // (syncEngine.ts:74-76) — it never errors, it just never syncs.
  for (const table of returned) {
    expect(configured.has(table)).toBe(true)
  }
})

it('marks every table server_wins, because that is the only behaviour implemented', () => {
  // `conflictResolution` and `writes` are required by SyncTableConfig
  // (types.ts:5-9) but read by NO code in the package. They are advisory
  // metadata for our layer; 'timestamp' is not implemented anywhere.
  for (const table of stourifyModuleConfig.tables) {
    expect(table.conflictResolution).toBe('server_wins')
  }
})

it('excludes sto_cities from the pushable set', () => {
  // Cities are global reference data and SyncPushRequest rejects an envelope
  // that names them (SyncRegistry.php:41).
  expect(PUSHABLE_TABLES).not.toContain('sto_cities')
  expect([...PUSHABLE_TABLES]).toEqual([
    'sto_spots',
    'sto_reviews',
    'sto_wishlist_items',
    'sto_follows',
    'sto_explorer_profiles',
  ])
  expect(stourifyModuleConfig.tables.find((t) => t.table === 'sto_cities')?.writes).toBe(false)
})

it('points push at the module route', () => {
  expect(PUSH_ENDPOINT).toBe('/stourify/sync/push')
})
