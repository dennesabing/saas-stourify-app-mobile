const mockClientGet = jest.fn()
const mockClientPost = jest.fn()

jest.mock('@/shared/api/client', () => ({
  client: {
    get: (...args: unknown[]) => mockClientGet(...args),
    post: (...args: unknown[]) => mockClientPost(...args),
  },
}))

import { createSpotAbout, getSpotAbouts } from '@/shared/api/spotAbouts'

beforeEach(() => {
  jest.clearAllMocks()
})

/**
 * Three notes on one spot, in the order the server sends them: most-liked
 * first, and among equals the newer one first. The counts are deliberately
 * unequal so that any accidental re-sort on the client changes the sequence.
 */
const ABOUT_PAGE = {
  data: [
    {
      uuid: 'a-popular',
      body: 'Go at sunrise.',
      likes_count: 5,
      created_at: '2026-08-01T00:00:00+00:00',
    },
    {
      uuid: 'a-middling',
      body: 'The side entrance is the open one.',
      likes_count: 2,
      created_at: '2026-08-10T00:00:00+00:00',
    },
    {
      uuid: 'a-fresh',
      body: 'Parking is behind the church.',
      likes_count: 0,
      created_at: '2026-08-20T00:00:00+00:00',
    },
  ],
  links: {},
  meta: { current_page: 1, last_page: 1, total: 3 },
}

describe('getSpotAbouts', () => {
  /**
   * `spot_uuid` is `required` on `SpotAboutIndexRequest` — the one index in the
   * module that has no meaning unbounded. Sending it under any other name is a
   * 422, not an unfiltered list, so this pins the spelling.
   */
  it('GETs /spot-abouts filtered by the spot, asking for the order out loud', async () => {
    mockClientGet.mockResolvedValueOnce({ data: ABOUT_PAGE })

    await getSpotAbouts('spot-1')

    const [url, config] = mockClientGet.mock.calls[0]
    expect(url).toBe('/spot-abouts')
    expect(config.params).toEqual({ spot_uuid: 'spot-1', sort: 'likes_count', direction: 'desc' })
  })

  /**
   * `sort` and `direction` happen to be the server's defaults today, so a
   * request that omitted them would look identical in every test and in every
   * screenshot. They are sent anyway: the list's entire promise to the reader
   * is its order, and a promise kept by somebody else's default is a promise
   * that changes the day the default does.
   */
  it('names the sort explicitly rather than relying on the server default', async () => {
    mockClientGet.mockResolvedValueOnce({ data: ABOUT_PAGE })

    await getSpotAbouts('spot-1')

    const [, config] = mockClientGet.mock.calls[0]
    expect(config.params.sort).toBe('likes_count')
    expect(config.params.direction).toBe('desc')
  })

  /**
   * The server orders by likes; the client must hand the page back untouched.
   * Asserting the whole sequence rather than the length is the point — a list
   * of three would pass under any ordering at all, including a reversed one.
   */
  it('preserves the server ordering instead of re-sorting the page', async () => {
    mockClientGet.mockResolvedValueOnce({ data: ABOUT_PAGE })

    const page = await getSpotAbouts('spot-1')

    expect(page.data.map((about) => about.uuid)).toEqual(['a-popular', 'a-middling', 'a-fresh'])
    expect(page.meta.total).toBe(3)
  })
})

describe('createSpotAbout', () => {
  /**
   * `SpotAboutStoreRequest` validates exactly `spot_uuid` and `body`. Laravel
   * discards keys it has no rule for without erroring, so a misnamed field here
   * is a silent no-op rather than a loud failure — the same trap `createSpot`
   * fell into under STOURIFY-2.
   */
  it('POSTs the two fields SpotAboutStoreRequest validates, and nothing else', async () => {
    mockClientPost.mockResolvedValueOnce({
      data: { data: { uuid: 'a-new', body: 'Go at sunrise.' }, message: 'ok' },
    })

    await createSpotAbout('spot-1', 'Go at sunrise.')

    expect(mockClientPost).toHaveBeenCalledWith('/spot-abouts', {
      spot_uuid: 'spot-1',
      body: 'Go at sunrise.',
    })
  })

  /**
   * A write answers with ONE entry wrapped in `data`, where the list answers
   * with a paginated envelope whose `data` is an array. Unwrapping the wrong
   * depth does not throw — it hands back an object that is missing every field
   * the screen then renders as blank.
   */
  it('unwraps the single-object envelope, not the paginated one', async () => {
    mockClientPost.mockResolvedValueOnce({
      data: {
        data: { uuid: 'a-new', body: 'Go at sunrise.', likes_count: 0 },
        message: 'About entry added successfully.',
      },
    })

    const created = await createSpotAbout('spot-1', 'Go at sunrise.')

    expect(created.uuid).toBe('a-new')
    expect(created.body).toBe('Go at sunrise.')
  })
})
