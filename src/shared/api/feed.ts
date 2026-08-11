import { client } from './client'
import type { CursorPaginatedResponse, Post } from './types'

/**
 * `GET /feed` is the only feed route the server registers.
 *
 * There is deliberately no nearby variant here. `getNearbyFeed` used to call
 * `/feed/nearby`, which was never registered; proximity lives on spots, not on
 * posts — see `getNearbySpots` in `./spots` (STOURIFY-8).
 */
export async function getFollowingFeed(cursor?: string): Promise<CursorPaginatedResponse<Post>> {
  const res = await client.get('/feed', { params: cursor ? { cursor } : {} })
  return res.data
}
