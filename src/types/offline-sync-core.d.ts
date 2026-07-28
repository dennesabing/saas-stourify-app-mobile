/**
 * Type-only mirror of `@soxerp/offline-sync-core`'s public surface, scoped in for
 * mobile's own `tsc` gate via the `paths` mapping in `tsconfig.json`.
 *
 * Why this exists: `@soxerp/offline-sync-core` (`../packages/offline-sync-core`)
 * has no `node_modules` of its own, so its `sanitize.ts` cannot resolve its
 * `@nozbe/watermelondb` peer dependency. `tsconfig.json`'s `exclude` cannot keep
 * that file out of mobile's program — TypeScript still type-checks any file
 * reachable via the import graph regardless of `exclude` (verified: an `exclude`
 * pattern does not stop a transitively-imported file from being checked). The
 * only way to keep that package's *implementation* out of mobile's compilation
 * unit is to redirect the module specifier itself, via `paths`, to a type-only
 * stand-in — this file. Mobile still consumes the REAL implementation at
 * runtime (Metro/Node module resolution is untouched by `tsconfig.json`
 * `paths`); only the type-checker sees this surface.
 *
 * Keep this in sync with the package's actual exports used below. That
 * package owns its own `npm run typecheck`; this file's job is only to give
 * mobile's compiler an accurate contract to check its own call sites against.
 */
declare module '@soxerp/offline-sync-core' {
  // ---- types.ts ----
  export type ConflictResolution = 'server_wins' | 'timestamp'

  export type RawRow = Record<string, unknown> & { id?: string; uuid?: string }

  export interface SyncTableConfig {
    table: string
    conflictResolution: ConflictResolution
    writes: boolean
  }

  export interface SyncModuleConfig {
    module: string
    deltaEndpoint: string
    tables: SyncTableConfig[]
  }

  export interface TableDelta {
    created: RawRow[]
    updated: RawRow[]
    deleted: string[]
  }

  export interface ModuleDeltaResponse {
    server_time: string
    [table: string]: TableDelta | string
  }

  // ---- seams.ts ----
  export interface KeyValueStore {
    getItem(key: string): Promise<string | null>
    setItem(key: string, value: string): Promise<void>
    removeItem(key: string): Promise<void>
  }

  export interface TokenStore {
    get(): Promise<string | null>
    set(token: string | null): Promise<void>
  }

  export interface ConnectivityMonitor {
    isOnline(): boolean
    subscribe(cb: (online: boolean) => void): () => void
  }

  export interface SyncCollection {
    find(id: string): Promise<{
      update(mutator: (r: any) => void): Promise<void>
      destroyPermanently(): Promise<void>
    }>
    create(builder: (r: any) => void): Promise<unknown>
  }

  export interface SyncDatabase {
    get(table: string): SyncCollection
    write<T>(work: () => Promise<T>): Promise<T>
  }

  // ---- httpClient.ts ----
  export function isNetworkFailure(error: unknown): boolean

  export interface HttpClientOptions {
    baseUrl: string
    apiPath: string
    tokenStore: TokenStore
    getOrgId?: () => string | null
    timeoutMs?: number
    onAuthRejection?: (reason: 'disabled' | 'unauthenticated') => void
    onReachability?: (ok: boolean) => void
  }

  export interface HttpClient {
    get<T>(path: string): Promise<{ data: T }>
    getRaw<T>(path: string): Promise<{ data: T }>
    post<T>(path: string, body?: unknown): Promise<{ data: T }>
    patch<T>(path: string, body?: unknown): Promise<{ data: T }>
    put<T>(path: string, body?: unknown): Promise<{ data: T }>
    del<T>(path: string): Promise<{ data: T }>
    getBlob(path: string): Promise<Blob>
    resetAuthGuard(): void
  }

  export function createHttpClient(opts: HttpClientOptions): HttpClient

  // ---- sanitize.ts ----
  export function buildSchemaSanitizer(
    schema: import('@nozbe/watermelondb').AppSchema,
  ): (table: string, raw: Record<string, unknown>) => Record<string, unknown>

  // ---- syncEngine.ts ----
  export interface SyncEngineOptions {
    db: SyncDatabase
    client: { get<T>(path: string): Promise<{ data: T }> }
    kv: KeyValueStore
    modules: SyncModuleConfig[]
    sanitizeRaw?: (table: string, raw: Record<string, unknown>) => Record<string, unknown>
  }

  export function createSyncEngine(opts: SyncEngineOptions): {
    runPullSync(): Promise<void>
    resetSyncState(): Promise<void>
  }
}
