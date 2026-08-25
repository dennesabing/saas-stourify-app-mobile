import { client } from './client'
import type { PaginatedResponse, Spot } from './types'

/**
 * One saved spot, as the server files it.
 *
 * `spot` is optional because the resource only includes it when the relation was
 * loaded. The list endpoint always loads it, so in practice it is there — but a
 * row whose spot has since been removed is a real thing, and a screen that
 * assumed otherwise would crash on exactly the row it most needs to survive.
 */
export interface WishlistItem {
  uuid: string
  note: string | null
  is_downloaded_offline: boolean
  spot?: Spot
  created_at: string
}

export const WISHLIST_QUERY_KEY = ['wishlist'] as const

/**
 * The spots this explorer has saved — `GET /api/v1/wishlist`.
 *
 * The server is asked rather than the local database, and that is worth stating
 * because the rest of this app leans the other way. Saving is written locally
 * first and drained later, so a local read would be the obvious choice. It does
 * not work here: the offline sync deliberately only carries down the explorer's
 * OWN spots, and the spots people save are overwhelmingly other people's. A
 * local-only Saved list would therefore be mostly rows with no spot attached to
 * them — a list of blanks.
 *
 * The consequence is that this screen needs the network the first time, and
 * says so plainly when it does not have it. React Query's persisted cache means
 * a list read once stays readable afterwards.
 */
export async function getWishlist(): Promise<WishlistItem[]> {
  const res = await client.get<PaginatedResponse<WishlistItem>>('/wishlist')
  return res.data?.data ?? []
}
