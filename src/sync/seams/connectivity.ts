import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import type { ConnectivityMonitor } from '@soxerp/offline-sync-core'
import { syncTrace } from '../trace'

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

function toOnline(state: NetInfoState): boolean {
  if (state.isConnected === false) return false
  return state.isInternetReachable !== false
}

export const netInfoConnectivity: ConnectivityMonitor = {
  isOnline: () => online,
  subscribe: (cb) => {
    // NetInfo emits on every connection-type/signal change, not only on a
    // real online/offline transition — a flaky radio can fire several
    // "still connected" events in a row. `online` is updated on every event
    // (so `isOnline()` always reflects the latest reading, and a genuinely
    // stale subscriber's own `previous` cannot desync from it), but `cb` is
    // only invoked when the value actually changes. That is what turns a run
    // of identical events into a single edge for callers like the scheduler,
    // which fires a full sync cycle on regain — without this, a flaky
    // connection would fire one sequential cycle per event.
    let previous = online

    return NetInfo.addEventListener((state) => {
      const next = toOnline(state)
      online = next

      // Observe-only, and it earns its place by separating two things that
      // otherwise look identical from further downstream: the network library
      // saying nothing at all, and it speaking while this seam decides the
      // reading is not a change and swallows it. Only one of those is a fault,
      // and the scheduler cannot tell them apart because in both cases nobody
      // calls it. Nothing here is read by any decision — see `trace.ts`.
      syncTrace(
        `seam netinfo type=${String(state.type)} conn=${String(state.isConnected)} ` +
          `reach=${String(state.isInternetReachable)} next=${next} ` +
          `edge=${next === previous ? 'none' : 'yes'}`,
      )

      if (next === previous) return
      previous = next
      cb(next)
    })
  },
}

/**
 * Keeps `isOnline()` fresh without any subscriber of its own. Returns the
 * unsubscribe function; the scheduler owns its lifetime.
 */
export function startConnectivityWatch(): () => void {
  return netInfoConnectivity.subscribe(() => {})
}
