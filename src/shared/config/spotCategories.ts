/**
 * The categories a spot can be filed under.
 *
 * **One list, two screens, and that is the whole point.** The Create screen
 * offers these when somebody adds a spot; the Discover rail filters by them.
 * If the two lists ever drift apart, the failure is silent and strange: a chip
 * that finds nothing because no spot was ever tagged with that word, or a
 * category people tag that nobody can filter by. Neither errors. Both just look
 * like the app is broken in a way nobody can describe.
 *
 * They lived as two separate arrays until STOURIFY-193, and had already drifted
 * — the Discover rail offered `Trending`, which is not a category and never was,
 * and omitted half of what the Create screen wrote.
 *
 * The server takes free strings: `SpotStoreRequest` has no list to check
 * against, and `SpotIndexRequest` deliberately does not constrain the filter to
 * a fixed set either, because it would then reject categories the same server
 * had accepted. **This file is the vocabulary. The server enforces nothing.**
 */
export const SPOT_CATEGORIES = [
  'Nature',
  'Foodie',
  'Coast',
  'Heritage',
  'Viewpoint',
  'Adventure',
  'Nightlife',
  'Shopping',
] as const

export type SpotCategory = (typeof SPOT_CATEGORIES)[number]
