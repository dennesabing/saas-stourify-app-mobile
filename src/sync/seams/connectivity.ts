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

function toOnline(state: NetInfoState): boolean {
  if (state.isConnected === false) return false
  return state.isInternetReachable !== false
}

export const netInfoConnectivity: ConnectivityMonitor = {
  isOnline: () => online,
  subscribe: (cb) =>
    NetInfo.addEventListener((state) => {
      const next = toOnline(state)
      online = next
      cb(next)
    }),
}

/**
 * Keeps `isOnline()` fresh without any subscriber of its own. Returns the
 * unsubscribe function; the scheduler owns its lifetime.
 */
export function startConnectivityWatch(): () => void {
  return netInfoConnectivity.subscribe(() => {})
}
