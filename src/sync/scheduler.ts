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
  const unsubscribeNetInfo = netInfoConnectivity.subscribe((online) => {
    useSyncStatusStore.getState().setOffline(!online)
    if (online) void runSyncCycle({ database, trigger: 'connectivity' })
  })

  let previousAppState: AppStateStatus = AppState.currentState

  const appStateSubscription = AppState.addEventListener('change', (next: AppStateStatus) => {
    const returningToForeground = previousAppState !== 'active' && next === 'active'
    previousAppState = next

    if (returningToForeground) void runSyncCycle({ database, trigger: 'foreground' })
  })

  return () => {
    unsubscribeNetInfo()
    appStateSubscription.remove()
  }
}
