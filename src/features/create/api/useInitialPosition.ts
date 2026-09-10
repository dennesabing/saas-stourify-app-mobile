import { useEffect, useRef, useState } from 'react'
import type { MapCoordinate } from '@/shared/map'
import { requestPosition } from '@/shared/location/position'

export type InitialPositionStatus = 'locating' | 'ready' | 'denied' | 'unavailable'

/**
 * Asks the phone where it is, once, when the New Spot form opens.
 *
 * The form no longer shows a map (STOURIFY-257) — the design gives location a
 * single row, and the map lives one tap away on `SpotLocationScreen`. But the
 * position must still arrive without anybody typing or tapping it, which is
 * STOURIFY-4's first acceptance line. So the form asks on its own, and this is
 * the asking. Retrying is the picker's job, not this hook's: a refusal here
 * just means the row invites a tap.
 *
 * `onFix` is held in a ref rather than listed as a dependency, for the reason
 * `LocationPicker` gives: a caller that re-creates it every render would
 * otherwise re-request the position on every keystroke.
 *
 * "Refused" and "silent" stay separate states, because the row says different
 * things for each — the lesson STOURIFY-20 learned on the Nearby screen.
 */
export function useInitialPosition(
  onFix: (coordinate: MapCoordinate) => void,
): InitialPositionStatus {
  const [status, setStatus] = useState<InitialPositionStatus>('locating')
  const onFixRef = useRef(onFix)
  onFixRef.current = onFix

  useEffect(() => {
    let cancelled = false

    async function locate(): Promise<void> {
      const result = await requestPosition()
      if (cancelled) return

      if (result.status === 'denied') {
        setStatus('denied')
        return
      }

      if (result.fix === null) {
        setStatus('unavailable')
        return
      }

      setStatus('ready')
      onFixRef.current(result.fix.coordinate)
    }

    void locate()

    return () => {
      cancelled = true
    }
  }, [])

  return status
}
