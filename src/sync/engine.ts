import type { Database } from '@nozbe/watermelondb'
import {
  buildSchemaSanitizer,
  createSyncEngine,
  isNetworkFailure,
  type HttpClient,
  type ModuleDeltaResponse,
} from '@soxerp/offline-sync-core'
import { stourifySchema } from '@/db/schema'
import { asyncStorageKv } from './seams/kv'
import { SYNC_MODULES } from './syncConfig'

/**
 * Columns the server sends as JSON arrays/objects and the local schema stores as
 * JSON text.
 *
 * `buildSchemaSanitizer`'s `string` coercion is `String(v)` (`sanitize.ts:29`),
 * so `["beach","nature"]` would arrive as the string `"beach,nature"` — lossy
 * and unparseable. Encode first, then delegate.
 */
const JSON_COLUMNS: Record<string, string[]> = {
  sto_spots: ['categories', 'hours'],
  sto_explorer_profiles: ['interests'],
}

/**
 * The engine's only injectable hook. It receives `(table, raw)` and cannot see
 * local state (`syncEngine.ts:9, 25-28`) — which is why the skip-pull gate, not
 * this function, is what protects an unpushed local edit.
 */
export function createSanitizeRaw(): (table: string, raw: Record<string, unknown>) => Record<string, unknown> {
  const base = buildSchemaSanitizer(stourifySchema)

  return (table, raw) => {
    const jsonColumns = JSON_COLUMNS[table]
    if (jsonColumns === undefined) return base(table, raw)

    const encoded: Record<string, unknown> = { ...raw }
    for (const column of jsonColumns) {
      const value = encoded[column]
      if (value !== undefined && value !== null && typeof value !== 'string') {
        encoded[column] = JSON.stringify(value)
      }
    }

    return base(table, encoded)
  }
}

export function countDeltaRows(response: ModuleDeltaResponse): number {
  let total = 0

  for (const value of Object.values(response)) {
    if (typeof value === 'string' || value === null || value === undefined) continue
    total += (value.created?.length ?? 0) + (value.updated?.length ?? 0) + (value.deleted?.length ?? 0)
  }

  return total
}

export interface ObservedPull {
  rows: number
  error: unknown | null
  networkFailure: boolean
}

/**
 * Wraps the client's `get` before handing it to the engine.
 *
 * `runPullSync()` resolves `void` and swallows every error into a `console.warn`
 * (`syncEngine.ts:88-90`), so at the call site total failure is
 * indistinguishable from success. Rather than read a result that does not exist,
 * observe from here — and always rethrow, so the engine still aborts
 * `pullModule` and leaves the cursor untouched (`syncEngine.ts:80` only runs on
 * success).
 */
export function createObservedClient(
  client: Pick<HttpClient, 'get'>,
  observed: ObservedPull,
): { get<T>(path: string): Promise<{ data: T }> } {
  return {
    async get<T>(path: string): Promise<{ data: T }> {
      try {
        const response = await client.get<T>(path)
        observed.rows += countDeltaRows(response.data as unknown as ModuleDeltaResponse)
        return response
      } catch (error) {
        observed.error = error
        observed.networkFailure = isNetworkFailure(error)
        throw error
      }
    },
  }
}

export interface StourifyEngine {
  runPullSync(): Promise<ObservedPull>
  resetSyncState(): Promise<void>
}

/**
 * WatermelonDB's `Database` satisfies the package's `SyncDatabase`
 * (`seams.ts:20-28`) structurally — no adapter, no wrapper.
 */
export function createStourifySyncEngine(
  database: Database,
  client: Pick<HttpClient, 'get'>,
): StourifyEngine {
  const sanitizeRaw = createSanitizeRaw()

  return {
    async runPullSync(): Promise<ObservedPull> {
      const observed: ObservedPull = { rows: 0, error: null, networkFailure: false }

      const engine = createSyncEngine({
        db: database as unknown as Parameters<typeof createSyncEngine>[0]['db'],
        client: createObservedClient(client, observed),
        kv: asyncStorageKv,
        modules: SYNC_MODULES,
        sanitizeRaw,
      })

      await engine.runPullSync()

      return observed
    },

    async resetSyncState(): Promise<void> {
      const engine = createSyncEngine({
        db: database as unknown as Parameters<typeof createSyncEngine>[0]['db'],
        client,
        kv: asyncStorageKv,
        modules: SYNC_MODULES,
        sanitizeRaw,
      })

      await engine.resetSyncState()
    },
  }
}
