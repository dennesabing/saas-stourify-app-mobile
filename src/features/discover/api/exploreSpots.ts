import { getSpots } from '@/shared/api/spots'
import type { Spot } from '@/shared/api/types'

/**
 * The explore grid's data access, in one file.
 *
 * The key is exported rather than written out at each call site because it is
 * also the name the on-disk cache files its answer under. Two copies of a key
 * that differ by one character do not fail — the screen simply never finds the
 * page it saved yesterday, and the offline behaviour looks like it was never
 * built. `mobile/src/shared/queryClient.ts` persists every query result to
 * AsyncStorage for 24 hours, so a stable key is the whole of the offline story.
 *
 * It takes the category since STOURIFY-193, so each chip caches its own page.
 * Leaving the category out of the key would have made every selection overwrite
 * the last one under a single name — and then serve the wrong chip's spots from
 * cache while the right ones were still loading.
 */
export const EXPLORE_SPOTS_QUERY_KEY = (category?: string) =>
  ['spots', 'explore', category ?? 'all'] as const

/**
 * The spot index, newest first — the server's default ordering, kept as
 * received. `SpotApiController::index` eager-loads `media`, so a page of spots
 * costs one query rather than one per row.
 */
export async function fetchExploreSpots(category?: string): Promise<Spot[]> {
  const page = await getSpots(category ? { category } : undefined)

  return page.data
}

/**
 * The picture a grid cell draws, and only ever the small one.
 *
 * A cell is roughly 170 points wide. `url` is the untouched upload — often
 * several megabytes — and `thumb_url` is the 400x400 conversion `Spot` registers
 * (`modules/Stourify/src/Models/Spot.php`). Returning `url` when the thumb is
 * missing is the obvious-looking fallback and is deliberately not done: a
 * conversion that has not run yet would silently put the entire grid back on
 * full-size originals, which is the exact cost this card exists to remove. A
 * missing thumb draws the placeholder tile instead.
 *
 * The first photo that *has* a thumb wins rather than strictly the first photo,
 * so a spot whose newest upload is still converting shows the ones that are
 * ready instead of a blank tile.
 */
export function thumbFor(spot: Spot): string | null {
  return spot.media?.find((media) => media.thumb_url)?.thumb_url ?? null
}
