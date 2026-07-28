import { AppState, type AppStateStatus } from 'react-native'
import type { Database } from '@nozbe/watermelondb'
import { runSyncCycle, type SyncCycleOutcome, type SyncTrigger } from './cycle'
import { netInfoConnectivity } from './seams/connectivity'
import { useSyncStatusStore } from './status'

/**
 * A cycle on demand — pull-to-refresh, and the one immediately after login.
 *
 * Overlap is safe: `runSyncCycle` holds a module-level mutex and returns
 * `skipped: 'in-flight'` rather than interleaving writes.
 */
export async function syncNow(database: Database, trigger: SyncTrigger = 'manual'): Promise<SyncCycleOutcome> {
  return runSyncCycle({ database, trigger })
}

/**
 * Wires the two ambient triggers. Returns the stop function; `App.tsx` owns its
 * lifetime.
 *
 * Only the transitions matter. Losing connectivity is recorded but never starts
 * a cycle, and `active → active` (which AppState emits on some Android
 * transitions) must not re-trigger, or a user tabbing through the app switcher
 * would sync repeatedly.
 *
 * No debouncing beyond that: connectivity-regained and foreground firing
 * together is exactly the "overlapping trigger" case Task 13's mutex exists
 * for — the second call resolves immediately with `skipped: 'in-flight'`. Add
 * suppression here and there is no test that proves it is doing anything
 * beyond what the mutex already guarantees, so it is left out.
 */
export function startSyncScheduler(database: Database): () => void {
  // Belt-and-braces alongside the two `unsubscribe`/`remove()` calls below: an
  // underlying event source is free to have already queued a dispatch before
  // it honours removal (or, in tests, a stray direct call to a captured
  // listener). Neither handler is stateless — running one after `stop()` has
  // been called would fire a sync cycle against a torn-down caller (e.g. post
  // logout) — so both check this flag first, not only relying on the
  // subscription actually being gone.
  let stopped = false

  const unsubscribeNetInfo = netInfoConnectivity.subscribe((online) => {
    if (stopped) return
    useSyncStatusStore.getState().setOffline(!online)
    if (online) void runSyncCycle({ database, trigger: 'connectivity' })
  })

  let previousAppState: AppStateStatus = AppState.currentState

  const appStateSubscription = AppState.addEventListener('change', (next: AppStateStatus) => {
    if (stopped) return
    const returningToForeground = previousAppState !== 'active' && next === 'active'
    previousAppState = next

    if (returningToForeground) void runSyncCycle({ database, trigger: 'foreground' })
  })

  return () => {
    stopped = true
    unsubscribeNetInfo()
    appStateSubscription.remove()
  }
}
