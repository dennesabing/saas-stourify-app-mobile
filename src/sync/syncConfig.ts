import type { SyncModuleConfig, SyncTableConfig } from '@soxerp/offline-sync-core'

/**
 * The client mirror of the server's `SyncRegistry`
 * (`modules/Stourify/src/Support/Sync/SyncRegistry.php:34-42`).
 *
 * Table names are the server's, VERBATIM. The engine matches delta response keys
 * to `SyncTableConfig.table` by exact string and silently skips a table it
 * cannot find (`syncEngine.ts:74-76`): `if (!delta || typeof delta === 'string')
 * continue;` — no error, no warning. A locally renamed table is not a mismatch
 * you will see; it is a table that never syncs.
 */
export const STOURIFY_MODULE = 'stourify'

/**
 * MUST be query-string-free. The engine appends `?since=` directly
 * (`syncEngine.ts:69-70`) with no query-merge logic, so an endpoint that already
 * carries a `?` produces a malformed URL.
 */
export const DELTA_ENDPOINT = '/stourify/sync/delta'

export const PUSH_ENDPOINT = '/stourify/sync/push'

/**
 * Everything except `sto_cities`, which is global reference data and is rejected
 * by `SyncPushRequest` if it appears in an envelope (`SyncRegistry.php:41`).
 */
export const PUSHABLE_TABLES = [
  'sto_spots',
  'sto_reviews',
  'sto_wishlist_items',
  'sto_follows',
  'sto_explorer_profiles',
] as const

/**
 * `conflictResolution` and `writes` are REQUIRED by `SyncTableConfig`
 * (`types.ts:5-9`) but read by no code in the package — `syncEngine.ts`
 * references neither. They are advisory metadata for our own layer; the engine's
 * real behaviour is hardcoded server-wins, and `'timestamp'` is not implemented
 * anywhere. Do not write client code that assumes setting `'timestamp'` changes
 * anything.
 */
function table(name: string, writes: boolean): SyncTableConfig {
  return { table: name, conflictResolution: 'server_wins', writes }
}

export const stourifyModuleConfig: SyncModuleConfig = {
  module: STOURIFY_MODULE,
  deltaEndpoint: DELTA_ENDPOINT,
  tables: [
    table('sto_spots', true),
    table('sto_reviews', true),
    table('sto_wishlist_items', true),
    table('sto_follows', true),
    table('sto_explorer_profiles', true),
    table('sto_cities', false),
  ],
}

export const SYNC_MODULES: SyncModuleConfig[] = [stourifyModuleConfig]
