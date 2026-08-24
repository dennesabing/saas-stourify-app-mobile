import type { Database } from '@nozbe/watermelondb'
import type { SyncCycleOutcome } from './cycle'
import { syncNow } from './scheduler'

/**
 * How long the trigger below refuses to fire again after it has fired.
 *
 * A door that closes behind you and will not re-open for a moment. Ten seconds
 * is long enough to swallow somebody tapping in and straight back out — and to
 * swallow React's development-mode habit of running an effect twice — while
 * being short enough that a person who went away, fixed their signal and came
 * back gets a real attempt rather than a shrug. The reasoning, and the two
 * numbers that lost, are on STOURIFY-179.
 */
export const SYNC_ON_OPEN_COOLDOWN_MS = 10_000

/**
 * The clock reading of the last cycle this module started. Module-level on
 * purpose: `SyncStatus` is registered in two navigation stacks (Create and
 * Profile), and opening one copy and then the other within a few seconds is one
 * open, not two.
 */
let lastOpenedAt: number | null = null

/** Test seam. The state above outlives a component, so a suite has to clear it. */
export function resetSyncOnOpen(): void {
  lastOpenedAt = null
}

/**
 * Somebody opened the Sync status screen, so try to send the queue.
 *
 * A driver who walks out to look at the van already suspects the parcels have
 * not gone. Until STOURIFY-179 that screen only reported: it would show a
 * stalled queue for as long as anyone stared at it, and nothing on it made the
 * queue move.
 *
 * Returns the cycle's outcome, or `null` when the cooling-off window turned the
 * call away.
 *
 * Overlap is somebody else's problem and already solved — `runSyncCycle` holds
 * a mutex and answers `skipped: 'in-flight'`. What the window adds is the case
 * the mutex cannot see: cycles that do not overlap because each one finished
 * before the next tap, which is a burst of real requests rather than a
 * correctness fault.
 *
 * `now` is injected so a test can state the times it means instead of driving
 * global fake timers; no production caller passes it.
 */
export async function syncOnScreenOpen(
  database: Database,
  now: number = Date.now(),
): Promise<SyncCycleOutcome | null> {
  if (lastOpenedAt !== null && now - lastOpenedAt < SYNC_ON_OPEN_COOLDOWN_MS) {
    return null
  }

  // Stamped BEFORE the await, or two mounts in one render pass would both read
  // the old value and both get through.
  lastOpenedAt = now

  return syncNow(database, 'screen-open')
}
