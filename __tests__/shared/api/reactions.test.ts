const mockClientPost = jest.fn()
const mockClientDelete = jest.fn()

jest.mock('@/shared/api/client', () => ({
  client: {
    post: (...args: unknown[]) => mockClientPost(...args),
    delete: (...args: unknown[]) => mockClientDelete(...args),
  },
}))

import { addReaction, removeReaction } from '@/shared/api/reactions'

beforeEach(() => {
  jest.clearAllMocks()
})

/**
 * The shape `ReactionController::respondWith()` answers with, every time —
 * wrapped in the axios response object the mocked client hands back, so the
 * state itself sits two levels down at `res.data.data`.
 */
const LIKED = { data: { data: { reacted: true, mine: 'like', counts: { like: 6 } } } }
const UNLIKED = { data: { data: { reacted: false, mine: null, counts: {} } } }

describe('addReaction', () => {
  /**
   * The host is named by its morph alias and its UUID — never a numeric id,
   * which no Stourify response contains. `AllowedMorph` rejects an alias that
   * is not in the morph map, so a typo here is a 422 rather than a like landing
   * on the wrong kind of record.
   */
  it('POSTs the alias, the uuid and the reaction type', async () => {
    mockClientPost.mockResolvedValueOnce(LIKED)

    await addReaction('stourify_spot_about', 'about-1')

    expect(mockClientPost).toHaveBeenCalledWith('/reactions', {
      reactable_type: 'stourify_spot_about',
      reactable_uuid: 'about-1',
      type: 'like',
    })
  })

  /**
   * The server's answer is the authority on what the count became — it accounts
   * for everyone else's taps, which the caller's own arithmetic cannot. So the
   * function returns it rather than the caller's guess.
   */
  it('hands back the state the server reports', async () => {
    mockClientPost.mockResolvedValueOnce(LIKED)

    const state = await addReaction('stourify_spot_about', 'about-1')

    expect(state).toEqual({ reacted: true, mine: 'like', counts: { like: 6 } })
  })
})

describe('removeReaction', () => {
  /**
   * The one call in this file that is easy to write and hard to notice wrong.
   * A `DELETE` has no body position in axios' argument list, so a payload
   * written where a `post` would put it becomes the *config* object and is
   * never sent — the server then answers 422 for two missing required fields
   * that the caller is certain it supplied. The payload belongs under `data`.
   */
  it('sends its payload as the request body, under axios’ `data` key', async () => {
    mockClientDelete.mockResolvedValueOnce(UNLIKED)

    await removeReaction('stourify_spot_about', 'about-1')

    expect(mockClientDelete).toHaveBeenCalledWith('/reactions', {
      data: { reactable_type: 'stourify_spot_about', reactable_uuid: 'about-1' },
    })

    const [, config] = mockClientDelete.mock.calls[0]
    expect(config).not.toHaveProperty('reactable_uuid')
  })

  /**
   * `counts` comes back as an empty object once the last reaction is gone, not
   * as a missing key and not as `[]` — `ReactionController` casts it to an
   * object for exactly this reason. A caller reading `counts.like` gets
   * `undefined`, which is the caller's job to treat as zero.
   */
  it('reports the emptied state after the last like is removed', async () => {
    mockClientDelete.mockResolvedValueOnce(UNLIKED)

    const state = await removeReaction('stourify_spot_about', 'about-1')

    expect(state.reacted).toBe(false)
    expect(state.mine).toBeNull()
    expect(state.counts.like).toBeUndefined()
  })
})
