const mockClientGet = jest.fn()
const mockClientPost = jest.fn()

jest.mock('@/shared/api/client', () => ({
  client: {
    get: (...args: unknown[]) => mockClientGet(...args),
    post: (...args: unknown[]) => mockClientPost(...args),
  },
}))

import { createSpotAboutComment, getSpotAboutComments } from '@/shared/api/comments'

beforeEach(() => {
  jest.clearAllMocks()
})

/**
 * A thread as the server sends it: newest first, paginated fifteen at a time
 * (`SpotAboutCommentApiController::index`). The envelope is the platform's
 * standard one, so these functions hand it back whole rather than digging a
 * list out of it — the screen wants the `meta` block too.
 */
const THREAD_PAGE = {
  data: [
    { id: 'c-new', body: 'Confirmed, the barrier came down on us.', parent_id: null },
    { id: 'c-old', body: 'The car park closes at six.', parent_id: null },
  ],
  links: {},
  meta: { current_page: 1, last_page: 1, total: 2 },
}

describe('getSpotAboutComments', () => {
  /**
   * The entry is addressed by its UUID, not by a database id.
   *
   * The platform's own comment endpoint wants `commentable_id`, a number no
   * Stourify response contains, so the module puts a small translating
   * controller in front of it. That is the whole reason this path exists and
   * the reason the UUID belongs in the URL rather than in a query parameter.
   */
  it('GETs the thread nested under the entry it belongs to', async () => {
    mockClientGet.mockResolvedValueOnce({ data: THREAD_PAGE })

    await getSpotAboutComments('about-1')

    expect(mockClientGet).toHaveBeenCalledWith('/spot-abouts/about-1/comments')
  })

  it('hands back the whole paginated envelope, untouched', async () => {
    mockClientGet.mockResolvedValueOnce({ data: THREAD_PAGE })

    await expect(getSpotAboutComments('about-1')).resolves.toEqual(THREAD_PAGE)
  })
})

describe('createSpotAboutComment', () => {
  it('POSTs just the body to that entry’s thread', async () => {
    mockClientPost.mockResolvedValueOnce({ data: { data: { id: 'c-new', body: 'Thanks' } } })

    await createSpotAboutComment('about-1', 'Thanks')

    expect(mockClientPost).toHaveBeenCalledWith('/spot-abouts/about-1/comments', { body: 'Thanks' })
  })

  /**
   * A single record comes back wrapped once — `{ data: { … } }` — while a list
   * comes back wrapped in the paginated envelope. Unwrapping the wrong depth
   * does not throw; it returns an object with a `data` key that every caller
   * then reads fields off and finds undefined.
   */
  it('unwraps the single-record envelope, so the caller gets the comment itself', async () => {
    mockClientPost.mockResolvedValueOnce({ data: { data: { id: 'c-new', body: 'Thanks' } } })

    await expect(createSpotAboutComment('about-1', 'Thanks')).resolves.toEqual({
      id: 'c-new',
      body: 'Thanks',
    })
  })
})
