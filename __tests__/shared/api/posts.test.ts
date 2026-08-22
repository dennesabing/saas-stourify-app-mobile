const mockClientPost = jest.fn()
const mockClientDelete = jest.fn()

jest.mock('@/shared/api/client', () => ({
  client: {
    post: (...args: unknown[]) => mockClientPost(...args),
    delete: (...args: unknown[]) => mockClientDelete(...args),
  },
}))

import { POST_REACTABLE_TYPE, setPostLike } from '@/shared/api/posts'

beforeEach(() => {
  jest.clearAllMocks()
})

/** What `ReactionController::respondWith()` answers, inside the axios envelope. */
const LIKED = { data: { data: { reacted: true, mine: 'like', counts: { like: 6 } } } }
const UNLIKED = { data: { data: { reacted: false, mine: null, counts: {} } } }

/**
 * These tests exist because of STOURIFY-149, where the app sent every like to
 * `POST /posts/{uuid}/like` — an address nothing has ever answered at — for four
 * months without a single test noticing.
 *
 * They cannot catch that class of fault on their own, and it is worth being
 * honest about why: the client here is mocked, so this file asserts the request
 * the app *builds* and never asks whether anything serves it. The check that
 * asks the second question is `scripts/check-mobile-api-routes.sh` in the root
 * repo, which compares these paths against the backend's own route table. What
 * these tests do own is the half that check cannot see — which verb goes out for
 * which intention, and what the caller gets back.
 */
describe('setPostLike', () => {
  /**
   * A post is liked through the platform's one generic reactions door, addressed
   * by the short type name the module registers for it. There is deliberately no
   * per-resource like route; `SpotAbout` is liked exactly the same way.
   */
  it('POSTs to the shared reactions endpoint when liking', async () => {
    mockClientPost.mockResolvedValueOnce(LIKED)

    await setPostLike('post-1', true)

    expect(mockClientPost).toHaveBeenCalledWith('/reactions', {
      reactable_type: 'stourify_post',
      reactable_uuid: 'post-1',
      type: 'like',
    })
    expect(mockClientDelete).not.toHaveBeenCalled()
  })

  /**
   * The alias is not typed twice. If the module ever renames it, the constant is
   * the single place it changes, and this assertion is what says the request
   * really uses it rather than a copy that happens to agree today.
   */
  it('names the post morph alias the module registers', () => {
    expect(POST_REACTABLE_TYPE).toBe('stourify_post')
  })

  /**
   * The important one. Removing a like is a DELETE, not a second POST.
   *
   * The server reads a repeated POST of a reaction you already hold as "take it
   * back", so a client that toggles is correct only while its idea of the current
   * state is fresh. Two devices, or one stale screen, and the toggle does the
   * opposite of what the person tapped. Saying `false` here means "end up not
   * liking it", whatever the server currently believes.
   */
  it('DELETEs when unliking, rather than posting the same reaction again', async () => {
    mockClientDelete.mockResolvedValueOnce(UNLIKED)

    await setPostLike('post-1', false)

    expect(mockClientDelete).toHaveBeenCalledWith('/reactions', {
      data: { reactable_type: 'stourify_post', reactable_uuid: 'post-1' },
    })
    expect(mockClientPost).not.toHaveBeenCalled()
  })

  /**
   * The server's count is the one that accounts for everybody else's taps, so it
   * is what comes back — not the caller's arithmetic.
   */
  it('returns the state and the count the server reports', async () => {
    mockClientPost.mockResolvedValueOnce(LIKED)

    await expect(setPostLike('post-1', true)).resolves.toEqual({ liked: true, likes_count: 6 })
  })

  /**
   * `counts` comes back as an empty object once the last like is gone — the key
   * is absent, not zero. A caller that read `counts.like` straight through would
   * render `undefined` under the heart, so the zero is supplied here.
   */
  it('reads a missing like count as zero rather than undefined', async () => {
    mockClientDelete.mockResolvedValueOnce(UNLIKED)

    await expect(setPostLike('post-1', false)).resolves.toEqual({ liked: false, likes_count: 0 })
  })
})
