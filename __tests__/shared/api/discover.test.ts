const mockClientGet = jest.fn()

jest.mock('@/shared/api/client', () => ({
  client: { get: (...args: unknown[]) => mockClientGet(...args) },
}))

import { searchDiscover, searchDiscoverType, searchPeople } from '@/shared/api/discover'

beforeEach(() => {
  jest.clearAllMocks()
})

/**
 * `GET /api/v1/discover/search` answers in two different shapes off one route,
 * decided by whether `type` was sent. `SearchApiController::index()` returns a
 * paginated resource collection for a typed request and a grouped
 * `{spots, cities, people}` preview for an untyped one — so the two shapes get
 * two functions rather than one that has to be interrogated by the caller.
 */
describe('searchDiscover — the untyped grouped preview', () => {
  it('sends `q` and NO `type`, so the server returns all three sections', async () => {
    mockClientGet.mockResolvedValueOnce({
      data: { data: { spots: [], cities: [], people: [] } },
    })

    await searchDiscover('kalaklan')

    expect(mockClientGet).toHaveBeenCalledWith('/discover/search', { params: { q: 'kalaklan' } })
    const [, config] = mockClientGet.mock.calls[0]
    expect(config.params).not.toHaveProperty('type')
  })

  it('unwraps the envelope to the three sections', async () => {
    mockClientGet.mockResolvedValueOnce({
      data: {
        data: {
          spots: [{ uuid: 'spot-1', title: 'Kalaklan Lighthouse' }],
          cities: [{ uuid: 'city-1', name: 'Olongapo' }],
          people: [{ uuid: 'person-1', username: 'wander_grace' }],
        },
      },
    })

    const results = await searchDiscover('kalaklan')

    expect(results.spots).toHaveLength(1)
    expect(results.cities[0].name).toBe('Olongapo')
    expect(results.people[0].username).toBe('wander_grace')
  })

  /**
   * A section the server omitted must read as empty, not as `undefined` — the
   * screen maps over all three unconditionally.
   */
  it('defaults a missing section to an empty array', async () => {
    mockClientGet.mockResolvedValueOnce({ data: { data: { spots: [{ uuid: 'spot-1' }] } } })

    const results = await searchDiscover('kalaklan')

    expect(results.spots).toHaveLength(1)
    expect(results.cities).toEqual([])
    expect(results.people).toEqual([])
  })
})

describe('searchDiscoverType — one paginated section', () => {
  it.each(['spots', 'cities', 'people'] as const)('sends type=%s', async (type) => {
    mockClientGet.mockResolvedValueOnce({ data: { data: [], links: {}, meta: {} } })

    await searchDiscoverType('kalaklan', type)

    expect(mockClientGet).toHaveBeenCalledWith('/discover/search', {
      params: { q: 'kalaklan', type },
    })
  })

  it('returns the paginated envelope untouched', async () => {
    mockClientGet.mockResolvedValueOnce({
      data: {
        data: [{ uuid: 'city-1', name: 'General Santos' }],
        links: {},
        meta: { current_page: 1, last_page: 1, total: 1 },
      },
    })

    const page = await searchDiscoverType('general', 'cities')

    expect(page.data[0].uuid).toBe('city-1')
    expect(page.meta.total).toBe(1)
  })
})

describe('searchPeople', () => {
  it('still routes through the same endpoint with type=people', async () => {
    mockClientGet.mockResolvedValueOnce({ data: { data: [], links: {}, meta: {} } })

    await searchPeople('grace')

    expect(mockClientGet).toHaveBeenCalledWith('/discover/search', {
      params: { q: 'grace', type: 'people' },
    })
  })
})
