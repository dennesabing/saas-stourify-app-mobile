/**
 * HAND-MAINTAINED MIRROR — read this before touching sync code.
 *
 * This file is a hand-maintained mirror of the public exports of
 * `packages/offline-sync-core/src/*` (types.ts, seams.ts, httpClient.ts,
 * sanitize.ts, syncEngine.ts). It affects TYPECHECKING ONLY:
 *   - Jest resolves the REAL source at test time via the `moduleNameMapper`
 *     entry for `^@soxerp/offline-sync-core$` in `package.json`.
 *   - Metro resolves the REAL source at runtime/build time via normal
 *     node_modules resolution (the `file:../packages/offline-sync-core`
 *     dependency).
 *   - Only `tsc` (via this file's `tsconfig.json` `paths` entry) sees this
 *     stub instead of the real implementation.
 *
 * Why it exists: `@soxerp/offline-sync-core` has no `node_modules` of its own
 * (and there is no root npm workspace above it either), so its `sanitize.ts`
 * cannot resolve its `@nozbe/watermelondb` peer dependency when type-checked
 * as part of mobile's program. `tsconfig.json`'s `exclude` cannot keep that
 * file out on its own — TypeScript still type-checks any file reachable via
 * the import graph regardless of `exclude` (verified empirically: an
 * `exclude` pattern does not stop a transitively-imported file from being
 * checked). Redirecting the module specifier itself via `paths` is what
 * actually keeps that package's implementation out of mobile's compilation
 * unit — and was chosen over alternatives that could plausibly have made
 * `sanitize.ts` itself typecheck cleanly in place (e.g. path-mapping
 * `@nozbe/watermelondb` so it resolves from there too), because letting
 * mobile's gate depend on that package's internals is exactly the sideways
 * coupling this project's dependency-direction rules prohibit — the
 * decision is architectural, not because the alternative was technically
 * unworkable.
 *
 * Verified faithful to the real package as of commit 1f0c62f (2026-07-28):
 * every export below was checked signature-by-signature (including optional
 * markers and return types) against the real source files.
 *
 * MUST be updated whenever `packages/offline-sync-core`'s exports change —
 * a new export, a changed signature, or a removed one. That package owns its
 * own gate: `npm --prefix ../packages/offline-sync-core run typecheck`. Run
 * it after any change there, then reconcile this file, then re-run this
 * repo's own `npm run typecheck`.
 *
 * A structural (not conventional) fix for the drift risk this file carries:
 * give `packages/offline-sync-core` a real devDependency on
 * `@nozbe/watermelondb` so it gets its own `node_modules`, then generate
 * this file's replacement with `tsc --emitDeclarationOnly` instead of
 * hand-maintaining it. Not done here — it touches that package's own repo,
 * out of scope for this commit.
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
