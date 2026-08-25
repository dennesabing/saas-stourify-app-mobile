import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import type { ConnectivityMonitor } from '@soxerp/offline-sync-core'

/**
 * The engine's connectivity seam (`seams.ts:15-18`).
 *
 * Starts optimistic (`true`): NetInfo's first real reading is asynchronous, and
 * assuming offline until proven otherwise would suppress the very first sync
 * after a cold start on a perfectly good connection.
 *
 * `isInternetReachable` is null while NetInfo is still probing, so it is only
 * treated as offline when it is explicitly `false` — a captive-portal probe in
 * progress is not the same thing as no radio.
 */
let online = true

/**
 * How often the seam re-asks when it believes it is offline (STOURIFY-134).
 *
 * Short enough that somebody who walks back into coverage and pockets their
 * phone gets their work sent while they are still standing there; long enough
 * that a handset genuinely in airplane mode pays four cheap local queries a
 * minute and nothing more. There is deliberately no backoff — it would make the
 * slowest case the long outage followed by a recovery, which is the exact case
 * this exists for.
 */
export const RECOVERY_PROBE_INTERVAL_MS = 15_000

/** Every caller currently listening, so one reading notifies all of them once. */
const listeners = new Set<(online: boolean) => void>()

let recoveryTimer: ReturnType<typeof setInterval> | null = null

function toOnline(state: NetInfoState): boolean {
  if (state.isConnected === false) return false
  return state.isInternetReachable !== false
}

/**
 * Takes one reading — from an event or from a probe, they are the same thing —
 * and makes it the truth.
 *
 * Subscribers hear about it only when the value actually changed. NetInfo emits
 * on every connection-type/signal change, not only on a real online/offline
 * transition, so a flaky radio can fire several "still connected" events in a
 * row; collapsing them here is what turns that run into a single edge for
 * callers like the scheduler, which fires a full sync cycle on regain.
 */
function apply(next: boolean): void {
  const changed = next !== online
  online = next
  syncRecoveryProbe()

  if (!changed) return
  for (const listener of [...listeners]) listener(next)
}

/**
 * Runs the probe while we believe we are offline, and not otherwise.
 *
 * The bug this repairs is not a wrong reading, it is a missing one: NetInfo can
 * answer "no network" during a real radio transition and then never speak
 * again, and the app has no other way to find out the street reopened. So while
 * the flag says offline we ask NetInfo ourselves. `refresh()` is the right call
 * rather than `fetch()` — it re-runs the internet-reachability test instead of
 * handing back the cached answer that is the thing we distrust.
 *
 * The timer exists only while offline, which on an ordinary day is never, so a
 * healthy app pays nothing for it.
 */
function syncRecoveryProbe(): void {
  if (online || listeners.size === 0) {
    stopRecoveryProbe()
    return
  }
  if (recoveryTimer) return

  recoveryTimer = setInterval(() => {
    // A probe that fails tells us nothing we did not already believe, so it
    // must not be allowed to reject and take the timer's callback with it.
    void NetInfo.refresh()
      .then((state) => apply(toOnline(state)))
      .catch(() => {})
  }, RECOVERY_PROBE_INTERVAL_MS)
}

function stopRecoveryProbe(): void {
  if (!recoveryTimer) return
  clearInterval(recoveryTimer)
  recoveryTimer = null
}

export const netInfoConnectivity: ConnectivityMonitor = {
  isOnline: () => online,
  subscribe: (cb) => {
    listeners.add(cb)

    // Each subscription keeps its own NetInfo registration, but every reading
    // is funnelled through `apply`, which owns the single shared flag. With two
    // subscribers a real event arrives down two paths and `apply` sees the
    // second one as no change, so it still reads as one transition.
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => apply(toOnline(state)))

    syncRecoveryProbe()

    return () => {
      listeners.delete(cb)
      unsubscribeNetInfo()
      if (listeners.size === 0) stopRecoveryProbe()
    }
  },
}

/**
 * Keeps `isOnline()` fresh without any subscriber of its own. Returns the
 * unsubscribe function; the scheduler owns its lifetime.
 */
export function startConnectivityWatch(): () => void {
  return netInfoConnectivity.subscribe(() => {})
}
