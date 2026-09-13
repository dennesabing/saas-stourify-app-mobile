import { client } from './client'
import { addReaction, removeReaction } from './reactions'
import type { PaginatedResponse, Review } from './types'

/**
 * The server side of a spot's reviews list — merged client-side in
 * `useSpotReviews`-plus-this-response by `ReviewsScreen` with the local,
 * possibly-still-queued rows. Writing a review is a local-only WatermelonDB
 * write (`createLocalReview`), never a call through this file.
 */
export async function getSpotReviews(spotUuid: string): Promise<PaginatedResponse<Review>> {
  const res = await client.get('/reviews', {
    params: { spot_uuid: spotUuid, sort: 'created_at', direction: 'desc' },
  })
  return res.data
}

/** `Modules\Stourify\Models\Review::morphAlias()` — how the reactions endpoint names a review. */
export const REVIEW_REACTABLE_TYPE = 'stourify_review'

/** `Review::HELPFUL_REACTION` — the only reaction a review accepts. */
const HELPFUL_REACTION = 'helpful'

/**
 * Mark a review helpful, or take the vote back (STOURIFY-293) — online only;
 * `useMarkHelpful` says why there is no offline path.
 *
 * It states an intention rather than flipping, for the reason `setPostLike`
 * gives: the server reads a second POST of a reaction you already hold as "take
 * it back", so a toggle hands the decision to whichever side has the staler
 * idea of the truth.
 *
 * Returns the server's own count afterwards. `counts.helpful` is absent rather
 * than zero once the last vote is gone, which is why the zero is supplied here.
 */
export async function setReviewHelpful(
  reviewUuid: string,
  helpful: boolean,
): Promise<{ helpful: boolean; helpful_count: number }> {
  const state = helpful
    ? await addReaction(REVIEW_REACTABLE_TYPE, reviewUuid, HELPFUL_REACTION)
    : await removeReaction(REVIEW_REACTABLE_TYPE, reviewUuid)

  return { helpful: state.reacted, helpful_count: state.counts[HELPFUL_REACTION] ?? 0 }
}
