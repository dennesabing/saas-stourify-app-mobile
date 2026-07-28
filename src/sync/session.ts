import type { Database } from '@nozbe/watermelondb'
import type { QueryClient } from '@tanstack/react-query'
import { getDatabase, wipeDatabase } from '@/db'
import { useAuthStore } from '@/shared/store/auth'
import { navigateTo } from '@/shared/navigation/ref'
import { queryClient as defaultQueryClient } from '@/shared/queryClient'
import { createStourifySyncEngine } from './engine'
import { resetSyncAuthGuard, setSyncAuthRejectionHandler, setSyncReachabilityHandler, syncHttpClient } from './httpClient'
import { syncNow } from './scheduler'
import { resetSyncStatus, useSyncStatusStore } from './status'

/**
 * Called on a fresh login.
 *
 * `resetAuthGuard()` matters: the auth latch (`authFired`, `httpClient.ts:57,
 * 62`) fires `onAuthRejection` once per client instance and then never again, so
 * without the reset a 401 after a re-login is silently ignored.
 */
export async function onLogin(database: Database = getDatabase()): Promise<void> {
  resetSyncAuthGuard()
  resetSyncStatus()
  await syncNow(database, 'login')
}

/**
 * Called on logout and on a 401 from either client — the ONE teardown path
 * (see `httpClient.ts:39-61`). This is also the ONLY function the app's
 * user-facing Logout button (`SettingsScreen.tsx`) may call — it must never
 * call `clearAuth()` directly, or the database/cursor/cache residue this task
 * exists to remove comes right back for the one path a real user actually
 * exercises.
 *
 * Order, and why:
 *  1. `clearAuth()` first — the token dies immediately, so nothing racing this
 *     teardown (an in-flight request that hasn't landed yet, a retry timer)
 *     can complete an authenticated call against a database that is about to
 *     be wiped out from under it.
 *  2. `resetSyncState()` before `wipeDatabase()` — reset writes to AsyncStorage
 *     (the cursor), wipe writes to the WatermelonDB adapter: different stores,
 *     so their relative order cannot corrupt either one. Cursor first only
 *     because it is the cheaper, synchronous-ish operation and there is no
 *     reason to make the slower wipe block it.
 *  3. `wipeDatabase()` — drops every local row so the next account inherits
 *     nothing.
 *  4. `queryClient.clear()` — drops every cached query/mutation (feed, profile,
 *     settings, etc.) so a screen that renders before its `useQuery` refetches
 *     cannot flash the previous account's data. Placed after the database wipe
 *     and before the status reset: it has no ordering dependency on either
 *     (React Query's cache is independent of both), so it sits with the other
 *     "erase residual state" steps rather than racing anything.
 *  5. `resetSyncStatus()` — clears the UI-facing pending count / lastSyncedAt
 *     / failures so the Offline screens do not flash the previous user's
 *     numbers for a frame after navigation.
 *  6. `navigateTo('Login')` last — only once the device is actually clean does
 *     the user get moved off the authenticated stack.
 *
 * Task 13's cycle is fire-and-forget: its mutex prevents a *second* cycle from
 * overlapping this teardown, but it does NOT cancel a cycle already in flight
 * when `signOut` is called. A cycle that started a moment earlier can still be
 * mid-write when `wipeDatabase()` runs. This is accepted, not fixed here: the
 * wipe (`unsafeResetDatabase`) runs inside WatermelonDB's serialized
 * `WorkQueue`, which aborts queued work, so the rows end up empty either way —
 * the residue this task exists to prevent, gone. A separate cancellation
 * mechanism for in-flight cycles is out of this task's scope (no such hook
 * exists on `runSyncCycle`).
 *
 * KNOWN GAP, disclosed and NOT fixed here (out of scope — no cancellation hook
 * exists to build it on): the sync CURSOR is not inside that same WorkQueue.
 * `packages/offline-sync-core/src/syncEngine.ts:67-81` writes the cursor via
 * `kv.setItem` AFTER `db.write()` resolves, unsynchronized with anything here.
 * A pull cycle in flight when `signOut` runs can therefore land its cursor
 * write AFTER `resetSyncState()` has cleared it — even after `signOut()` has
 * already returned — leaving the next account with a stale cursor and a
 * partial backfill instead of a full one. The rows are still safe (wiped
 * either way, per the paragraph above); only the cursor can end up wrong.
 * Fixing this needs a session/generation token that `pullModule` checks
 * immediately before its `kv.setItem` write (bump the generation in
 * `signOut`/`onLogin`, drop the write if the generation that started the pull
 * is stale by the time it would land) — that hook does not exist in
 * `offline-sync-core` today and adding it is a package-level change outside
 * this task's file list.
 */
export async function signOut(
  database: Database = getDatabase(),
  qc: QueryClient = defaultQueryClient,
): Promise<void> {
  useAuthStore.getState().clearAuth()

  await createStourifySyncEngine(database, syncHttpClient).resetSyncState()
  await wipeDatabase(database)

  qc.clear()
  resetSyncStatus()
  navigateTo('Login')
}

/**
 * Registers the sync client's callbacks at app start.
 *
 * A registered handler rather than a direct import because `session.ts` needs
 * the client and the client would then need `session.ts` — a cycle.
 */
export function installSyncSessionHandlers(database: Database): void {
  setSyncAuthRejectionHandler(() => {
    void signOut(database)
  })

  setSyncReachabilityHandler((ok) => {
    useSyncStatusStore.getState().setOffline(!ok)
  })
}
