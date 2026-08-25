import { useEffect, useState } from 'react'
import { Q } from '@nozbe/watermelondb'
import { useDatabase } from '@nozbe/watermelondb/react'
import type Spot from '@/db/models/Spot'

/** The shape `MySpotsScreen` renders — a snapshot, not a live model. */
export interface MySpotRow {
  id: string
  title: string
  /** The spot's photo, or `null` — see `Spot.coverPhotoUrl`. */
  coverPhotoUrl: string | null
  /** `published`, `draft`, `under_review` or `removed`. */
  status: string
  ratingAverage: number | null
  reviewsCount: number
  isQueued: boolean
}

/**
 * Subscribes to the local spots collection.
 *
 * NOT `observeWithColumns`, and not a plain `observe()`. Both re-emit only when
 * the matching SET changes or when a listed SCHEMA column changes value — and
 * `_status` is neither. A push ack flips `_status` from `created` to `synced`
 * without touching a column, so under either observer the `Queued ↑` badge
 * would never clear. Verified: `observeWithColumns(['title','status'])` emits
 * exactly once across a `markSynced()`, while `withChangesForTables` emits on
 * the flip.
 *
 * The rows are mapped to plain snapshots so a re-render actually happens: the
 * model instances are mutated in place, so a re-emitted array of the same
 * objects is invisible to `FlatList`'s per-cell memoization.
 */
export function useMySpots(): MySpotRow[] {
  const database = useDatabase()
  const [spots, setSpots] = useState<MySpotRow[]>([])

  useEffect(() => {
    let cancelled = false

    const query = database.get<Spot>('sto_spots').query(Q.sortBy('created_at', Q.desc))

    const subscription = database.withChangesForTables(['sto_spots']).subscribe(() => {
      void query.fetch().then((rows) => {
        if (cancelled) return

        setSpots(
          rows.map((row) => ({
            id: row.id,
            title: row.title,
            coverPhotoUrl: row.coverPhotoUrl,
            status: row.status,
            ratingAverage: row.ratingAverage,
            reviewsCount: row.reviewsCount,
            isQueued: row.isQueued,
          })),
        )
      })
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [database])

  return spots
}
