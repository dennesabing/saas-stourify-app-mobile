import { client } from './client'
import type { PaginatedResponse, SpotAbout } from './types'

/**
 * The About entries on one spot — the corkboard beside the brass plaque.
 *
 * A spot's own `description` is written once, by whoever added the spot. These
 * are something else: short notes any visitor can pin up about the place, each
 * one likeable, listed with the most-liked first so the useful ones drift to
 * the top.
 *
 * The server endpoint is `/api/v1/spot-abouts`, and its full argument lives in
 * `specs/2026-08-22-spot-about-design.md` §5.3.
 */

/**
 * One spot's entries, best first.
 *
 * `sort` and `direction` are sent even though they are the server's own
 * defaults, and that is deliberate. The whole promise this list makes to the
 * reader is its ORDER; leaving that promise to somebody else's default means it
 * quietly changes meaning the day the default does. Naming it costs two query
 * parameters and makes the request say what the screen is relying on.
 *
 * `spot_uuid` is `required` on the server (`SpotAboutIndexRequest`) rather than
 * optional, because "every About entry everywhere, most-liked first" is not a
 * screen anybody wants and answering it would page through every spot.
 */
export async function getSpotAbouts(spotUuid: string): Promise<PaginatedResponse<SpotAbout>> {
  const res = await client.get('/spot-abouts', {
    params: { spot_uuid: spotUuid, sort: 'likes_count', direction: 'desc' },
  })
  return res.data
}

/**
 * Pin a new note to a spot.
 *
 * Exactly the two keys `SpotAboutStoreRequest` validates. Laravel discards a
 * key it has no rule for without complaining, so an extra or misspelled field
 * here is a silent no-op rather than an error somebody would notice — the trap
 * `createSpot` fell into under STOURIFY-2.
 *
 * The reply is a single entry wrapped in `data`, not the paginated envelope the
 * list returns, so this unwraps one level further than `getSpotAbouts` does.
 */
export async function createSpotAbout(spotUuid: string, body: string): Promise<SpotAbout> {
  const res = await client.post('/spot-abouts', { spot_uuid: spotUuid, body })
  return res.data.data
}
