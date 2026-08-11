import { client } from './client'
import type {
  City,
  DiscoverSearchResults,
  DiscoverSearchType,
  PaginatedResponse,
  Person,
  Spot,
} from './types'

/**
 * Discovery search — `GET /api/v1/discover/search`.
 *
 * One route, two response shapes, decided by `type`:
 *
 * - **untyped** → a grouped preview `{spots, cities, people}`, each section
 *   capped at 5 by the server. One request, three sections.
 * - **typed** → one paginated collection of that type.
 *
 * They are two functions rather than one because a caller that has to
 * interrogate the response to find out which shape it got is a caller that will
 * eventually get it wrong.
 *
 * `q` is `required|min:2` in `SearchRequest`, so a shorter query is a 422 and
 * not an empty result set — callers must gate on length rather than sending it.
 * `type` accepts only `spots | cities | people`; `tags` is explicitly rejected
 * (STOURIFY-25).
 */
export async function searchDiscover(query: string): Promise<DiscoverSearchResults> {
  const res = await client.get('/discover/search', { params: { q: query } })
  const data = res.data?.data ?? {}

  // A section the server omitted reads as empty, never `undefined` — every
  // caller maps all three unconditionally.
  return {
    spots: (data.spots ?? []) as Spot[],
    cities: (data.cities ?? []) as City[],
    people: (data.people ?? []) as Person[],
  }
}

/**
 * One paginated section. `Results` is the union of the three row shapes; a
 * caller that knows its `type` narrows it at the call site.
 */
export async function searchDiscoverType(
  query: string,
  type: DiscoverSearchType,
): Promise<PaginatedResponse<Spot | City | Person>> {
  const res = await client.get('/discover/search', { params: { q: query, type } })
  return res.data
}

/**
 * People search. There is no follow *suggestions* endpoint; the onboarding
 * follow-suggestions step is built on this search, deliberately not styled as
 * "suggested for you".
 */
export async function searchPeople(query: string): Promise<PaginatedResponse<Person>> {
  const res = await client.get('/discover/search', { params: { q: query, type: 'people' } })
  return res.data
}
