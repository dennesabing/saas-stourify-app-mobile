import { useEffect, useState } from 'react'
import { Q } from '@nozbe/watermelondb'
import { useDatabase } from '@nozbe/watermelondb/react'
import type WishlistItem from '@/db/models/WishlistItem'

export interface SpotSaveState {
  isSaved: boolean
  /** True while the save is still local-only and has not drained through the M2c queue. */
  isQueued: boolean
}

/**
 * Whether the current spot already has a local `sto_wishlist_items` row.
 *
 * `withChangesForTables`, not `observeWithColumns` — same reasoning as
 * `useSpotReviews.ts` and `useMySpots.ts`: a push ack flips `_status` without
 * touching a schema column, so the queued affordance would never clear under
 * a column-keyed observer.
 */
export function useIsSpotSaved(spotUuid: string): SpotSaveState {
  const database = useDatabase()
  const [state, setState] = useState<SpotSaveState>({ isSaved: false, isQueued: false })

  useEffect(() => {
    let cancelled = false

    const query = database
      .get<WishlistItem>('sto_wishlist_items')
      .query(Q.where('spot_uuid', spotUuid))

    const subscription = database.withChangesForTables(['sto_wishlist_items']).subscribe(() => {
      void query.fetch().then((rows) => {
        if (cancelled) return

        const [row] = rows
        setState(row ? { isSaved: true, isQueued: row.isQueued } : { isSaved: false, isQueued: false })
      })
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [database, spotUuid])

  return state
}
