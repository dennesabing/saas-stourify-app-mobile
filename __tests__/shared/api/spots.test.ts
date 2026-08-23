const mockClientGet = jest.fn()
const mockClientPost = jest.fn()

jest.mock('@/shared/api/client', () => ({
  client: {
    get: (...args: unknown[]) => mockClientGet(...args),
    post: (...args: unknown[]) => mockClientPost(...args),
  },
}))

import { createSpot, getNearbySpots, getSpotPosts } from '@/shared/api/spots'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('createSpot', () => {
  /**
   * `title` is the server's field name (`SpotStoreRequest`), not `name`.
   *
   * This posted `name` until STOURIFY-2, and because Laravel silently drops
   * unvalidated keys the spot would have been created with no title at all —
   * or, since `title` is `required`, rejected with a 422 naming a field the
   * client never sent. Nothing called `createSpot` yet, so the trap was
   * dormant rather than absent.
   */
  it('POSTs `title`, the field SpotStoreRequest actually validates', async () => {
    mockClientPost.mockResolvedValueOnce({
      data: { data: { uuid: 'spot-uuid-1', title: 'Hidden Cove' }, message: 'ok' },
    })

    const spot = await createSpot({
      title: 'Hidden Cove',
      latitude: 6.1164,
      longitude: 125.1716,
      description: 'A quiet cove past the last barangay road.',
    })

    expect(mockClientPost).toHaveBeenCalledWith('/spots', {
      title: 'Hidden Cove',
      latitude: 6.1164,
      longitude: 125.1716,
      description: 'A quiet cove past the last barangay road.',
    })
    expect(spot.uuid).toBe('spot-uuid-1')
  })

  it('never sends a `name` key — the server has no rule for it and would drop it silently', async () => {
    mockClientPost.mockResolvedValueOnce({ data: { data: { uuid: 'spot-uuid-2' }, message: 'ok' } })

    await createSpot({ title: 'Kalaklan Point', latitude: 6.2, longitude: 125.2 })

    const [, body] = mockClientPost.mock.calls[0]
    expect(body).not.toHaveProperty('name')
    expect(body).toEqual({ title: 'Kalaklan Point', latitude: 6.2, longitude: 125.2 })
  })
})

/**
 * A seeded General Santos City cluster with distances chosen so the ordering is
 * unambiguous. `6.1164,125.1716` is the viewer; each spot is due north of it,
 * so the separation is pure latitude and the expected sequence is arithmetic:
 * 0 km, ~1.1 km, ~2.6 km, ~5.3 km.
 */
const GENSAN_VIEWER = { lat: 6.1164, lng: 125.1716 }

const GENSAN_NEARBY_PAGE = {
  data: [
    {
      uuid: 'plaza',
      title: 'Plaza Heneral Santos',
      latitude: 6.1164,
      longitude: 125.1716,
      distance_km: 0,
    },
    {
      uuid: 'oval',
      title: 'Oval Plaza',
      latitude: 6.1264,
      longitude: 125.1716,
      distance_km: 1.113,
    },
    {
      uuid: 'market',
      title: 'Bula Fish Port',
      latitude: 6.14,
      longitude: 125.1716,
      distance_km: 2.627,
    },
    {
      uuid: 'lagao',
      title: 'Lagao Gymnasium',
      latitude: 6.1642,
      longitude: 125.1716,
      distance_km: 5.322,
    },
  ],
  links: {},
  meta: { current_page: 1, last_page: 1, total: 4 },
}

describe('getNearbySpots', () => {
  /**
   * The endpoint is `/spots/nearby`. `getNearbyFeed` used to call `/feed/nearby`,
   * a route that was never registered — so Nearby rendered "No spots nearby"
   * for its entire life while the 404 was swallowed as an empty result.
   */
  it('GETs /spots/nearby, not the unregistered /feed/nearby', async () => {
    mockClientGet.mockResolvedValueOnce({ data: GENSAN_NEARBY_PAGE })

    await getNearbySpots(GENSAN_VIEWER.lat, GENSAN_VIEWER.lng, 10)

    const [url] = mockClientGet.mock.calls[0]
    expect(url).toBe('/spots/nearby')
    expect(url).not.toContain('/feed')
  })

  /**
   * `radius`, not `radius_km`. `SpotNearbyRequest` validates `lat`, `lng`,
   * `radius`, `per_page`, `page` — and Laravel drops anything else without
   * complaint, so a misspelt radius would silently fall back to the server's
   * 5 km default instead of erroring.
   */
  it('sends the parameter names SpotNearbyRequest validates', async () => {
    mockClientGet.mockResolvedValueOnce({ data: GENSAN_NEARBY_PAGE })

    await getNearbySpots(GENSAN_VIEWER.lat, GENSAN_VIEWER.lng, 25)

    const [, config] = mockClientGet.mock.calls[0]
    expect(config.params).toEqual({ lat: 6.1164, lng: 125.1716, radius: 25 })
    expect(config.params).not.toHaveProperty('radius_km')
  })

  it('adds `page` only when one is asked for', async () => {
    mockClientGet.mockResolvedValueOnce({ data: GENSAN_NEARBY_PAGE })

    await getNearbySpots(GENSAN_VIEWER.lat, GENSAN_VIEWER.lng, 10, 3)

    const [, config] = mockClientGet.mock.calls[0]
    expect(config.params).toEqual({ lat: 6.1164, lng: 125.1716, radius: 10, page: 3 })
  })

  /**
   * The server orders by distance; the client must not reshuffle it. This
   * asserts the whole sequence, not merely that four spots came back — a
   * non-empty array would pass under any order at all.
   */
  it('preserves the server distance ordering across the GenSan cluster', async () => {
    mockClientGet.mockResolvedValueOnce({ data: GENSAN_NEARBY_PAGE })

    const page = await getNearbySpots(GENSAN_VIEWER.lat, GENSAN_VIEWER.lng, 10)

    expect(page.data.map((spot) => spot.uuid)).toEqual(['plaza', 'oval', 'market', 'lagao'])
    expect(page.data.map((spot) => spot.distance_km)).toEqual([0, 1.113, 2.627, 5.322])
  })
})

/**
 * A page of posts as the post index actually answers it, trimmed to the fields
 * these tests read. Two photos at one spot, newest first — which is the order
 * `PostApiController::index` sorts in and the order the grid draws in.
 */
const SPOT_POSTS_PAGE = {
  data: [
    { uuid: 'post-newer', caption: 'Sunset over the cove', published_at: '2026-08-20T09:00:00Z' },
    { uuid: 'post-older', caption: 'Low tide', published_at: '2026-08-14T09:00:00Z' },
  ],
  links: {},
  meta: { current_page: 1, last_page: 1, total: 2 },
}

describe('getSpotPosts', () => {
  /**
   * The photo grid on a spot asked `GET /spots/{uuid}/posts` from the app's
   * very first commit on 2026-04-25 until STOURIFY-155. That route has never
   * been registered, so every request 404'd — and the screen fetches the spot
   * itself separately, so the page rendered perfectly with one empty grid on
   * it. An empty grid looks like a quiet spot, not like a failure, which is how
   * it survived four months.
   *
   * The posts live behind a filter on the post index instead, exactly like
   * `getUserPosts` one function down.
   */
  it('GETs the post index, not the unregistered /spots/{uuid}/posts', async () => {
    mockClientGet.mockResolvedValueOnce({ data: SPOT_POSTS_PAGE })

    await getSpotPosts('spot-uuid-1')

    const [url] = mockClientGet.mock.calls[0]
    expect(url).toBe('/posts')
    expect(url).not.toContain('/spots/')
  })

  /**
   * `spot_uuid` is the name `PostIndexRequest` validates. Getting it wrong is
   * not a 422 — Laravel drops a query parameter it has no rule for and answers
   * happily, so a misspelling here would fill a spot's grid with EVERY post in
   * the app while looking completely healthy. That is the same silent-drop trap
   * that made `getSpots` search nothing at all until 2026-07-29.
   */
  it('sends the filter under the name PostIndexRequest validates', async () => {
    mockClientGet.mockResolvedValueOnce({ data: SPOT_POSTS_PAGE })

    await getSpotPosts('spot-uuid-1')

    const [, config] = mockClientGet.mock.calls[0]
    expect(config.params).toEqual({ spot_uuid: 'spot-uuid-1' })
    expect(config.params).not.toHaveProperty('spot')
    expect(config.params).not.toHaveProperty('spotUuid')
  })

  /**
   * The whole paginated envelope is handed back, not just the rows: the screen
   * reads `postsData?.data`, and `meta` is what a later paging change would
   * need. The server's order is preserved rather than re-sorted here.
   */
  it('returns the page as received, newest post first', async () => {
    mockClientGet.mockResolvedValueOnce({ data: SPOT_POSTS_PAGE })

    const page = await getSpotPosts('spot-uuid-1')

    expect(page.data.map((post) => post.uuid)).toEqual(['post-newer', 'post-older'])
    expect(page.meta.total).toBe(2)
  })
})
