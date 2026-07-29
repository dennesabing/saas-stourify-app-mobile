import { useEffect, useState } from 'react'
import { Q } from '@nozbe/watermelondb'
import { useDatabase } from '@nozbe/watermelondb/react'
import type Review from '@/db/models/Review'

/** The shape a reviews list renders — a snapshot, not a live model. */
export interface SpotReviewRow {
  id: string
  rating: number
  body: string | null
  userId: number | null
  helpfulCount: number
  isQueued: boolean
  createdAt: number
}

/**
 * Subscribes to the local `sto_reviews` collection, scoped to one spot.
 *
 * Filters on `spot_uuid`, not the numeric `spot_id`: `SpotResource` never
 * sends a numeric spot id (only `uuid`), so a review written against a spot
 * fetched from the API almost always has `spot_id: null`. `spot_uuid` is the
 * one identifier a locally-written review is guaranteed to carry
 * (`createLocalReview.ts`), so it is the only reliable join key here.
 *
 * `withChangesForTables`, NOT `observeWithColumns` — same reasoning as
 * `useMySpots.ts:19-27`: a push ack flips `_status` from `created` to
 * `synced` without touching a schema column, so a queued badge driven by
 * `observeWithColumns` would never clear. Verified the same way: the flip has
 * to be visible for the "queued until markSynced" behaviour to work at all.
 *
 * Rows are mapped to plain snapshots, not model instances, so a re-emitted
 * array is actually a new array a `FlatList` will re-render.
 */
export function useSpotReviews(spotUuid: string): SpotReviewRow[] {
  const database = useDatabase()
  const [reviews, setReviews] = useState<SpotReviewRow[]>([])

  useEffect(() => {
    let cancelled = false

    const query = database
      .get<Review>('sto_reviews')
      .query(Q.where('spot_uuid', spotUuid), Q.sortBy('created_at', Q.desc))

    const subscription = database.withChangesForTables(['sto_reviews']).subscribe(() => {
      void query.fetch().then((rows) => {
        if (cancelled) return

        setReviews(
          rows.map((row) => ({
            id: row.id,
            rating: row.rating,
            body: row.body,
            userId: row.userId,
            helpfulCount: row.helpfulCount,
            isQueued: row.isQueued,
            createdAt: (row._raw as Record<string, unknown>).created_at as number,
          })),
        )
      })
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [database, spotUuid])

  return reviews
}
