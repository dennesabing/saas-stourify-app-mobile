import { useEffect, useState } from 'react'
import { netInfoConnectivity } from '@/sync/seams/connectivity'

/**
 * Whether the device currently has a usable connection, for screens that need
 * to say something about it.
 *
 * It reads the sync layer's own connectivity seam rather than subscribing to
 * NetInfo again. One source means a screen can never disagree with the sync
 * engine about whether the app is offline — and the seam already does the
 * awkward part, collapsing a flaky radio's stream of "still connected" events
 * into a single edge.
 *
 * Starts from the seam's current reading, which is optimistic (`true`) before
 * NetInfo's first real answer arrives: an offline notice that flashes up on a
 * perfectly good connection is worse than one that appears a moment late.
 */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(() => netInfoConnectivity.isOnline())

  useEffect(() => {
    setOnline(netInfoConnectivity.isOnline())
    return netInfoConnectivity.subscribe(setOnline)
  }, [])

  return online
}
