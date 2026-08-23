import { client } from './client'
import type { PaginatedResponse, Review } from './types'

/**
 * The server side of a spot's reviews list — merged client-side in
 * `useSpotReviews`-plus-this-response by `ReviewsScreen` with the local,
 * possibly-still-queued rows. Read-only: writing a review is a local-only
 * WatermelonDB write (`createLocalReview`), never a call through this file.
 */
export async function getSpotReviews(spotUuid: string): Promise<PaginatedResponse<Review>> {
  const res = await client.get('/reviews', {
    params: { spot_uuid: spotUuid, sort: 'created_at', direction: 'desc' },
  })
  return res.data
}
