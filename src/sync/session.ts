import type { Database } from '@nozbe/watermelondb'
import { getDatabase, wipeDatabase } from '@/db'
import { useAuthStore } from '@/shared/store/auth'
import { navigateTo } from '@/shared/navigation/ref'
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
 * (see `httpClient.ts:39-61`).
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
 *  4. `resetSyncStatus()` — clears the UI-facing pending count / lastSyncedAt
 *     / failures so the Offline screens do not flash the previous user's
 *     numbers for a frame after navigation.
 *  5. `navigateTo('Login')` last — only once the device is actually clean does
 *     the user get moved off the authenticated stack.
 *
 * Task 13's cycle is fire-and-forget: its mutex prevents a *second* cycle from
 * overlapping this teardown, but it does NOT cancel a cycle already in flight
 * when `signOut` is called. A cycle that started a moment earlier can still be
 * mid-write when `wipeDatabase()` runs. This is accepted, not fixed here: the
 * wipe (`unsafeResetDatabase`) is a full reset regardless of what a concurrent
 * writer just did, so the end state after both settle is still "no local
 * rows" — the residue this task exists to prevent. A separate cancellation
 * mechanism for in-flight cycles is out of this task's scope (no such hook
 * exists on `runSyncCycle`).
 */
export async function signOut(database: Database = getDatabase()): Promise<void> {
  useAuthStore.getState().clearAuth()

  await createStourifySyncEngine(database, syncHttpClient).resetSyncState()
  await wipeDatabase(database)

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
