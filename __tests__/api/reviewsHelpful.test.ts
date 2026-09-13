jest.mock('@/shared/api/reactions', () => ({
  addReaction: jest.fn(),
  removeReaction: jest.fn(),
}))

import { addReaction, removeReaction } from '@/shared/api/reactions'
import { REVIEW_REACTABLE_TYPE, setReviewHelpful } from '@/shared/api/reviews'

/**
 * "Helpful" on a review rides on the platform's generic reactions endpoint,
 * like a post's like (STOURIFY-293). It states an intention rather than
 * flipping, for the reason `setPostLike` gives: a second POST of a reaction you
 * already hold is read by the server as "take it back".
 */
beforeEach(() => jest.clearAllMocks())

it('uses the review alias the server declares', () => {
  // `Modules\Stourify\Models\Review::morphAlias()`.
  expect(REVIEW_REACTABLE_TYPE).toBe('stourify_review')
})

it('adds the helpful reaction and reports the server count', async () => {
  ;(addReaction as jest.Mock).mockResolvedValue({
    reacted: true,
    mine: 'helpful',
    counts: { helpful: 4 },
  })

  await expect(setReviewHelpful('review-1', true)).resolves.toEqual({
    helpful: true,
    helpful_count: 4,
  })
  expect(addReaction).toHaveBeenCalledWith('stourify_review', 'review-1', 'helpful')
  expect(removeReaction).not.toHaveBeenCalled()
})

it('takes the vote back, and reads a missing count as zero', async () => {
  // The server drops the key, rather than sending 0, once the last vote goes.
  ;(removeReaction as jest.Mock).mockResolvedValue({ reacted: false, mine: null, counts: {} })

  await expect(setReviewHelpful('review-1', false)).resolves.toEqual({
    helpful: false,
    helpful_count: 0,
  })
  expect(removeReaction).toHaveBeenCalledWith('stourify_review', 'review-1')
  expect(addReaction).not.toHaveBeenCalled()
})
