import { client } from './client'
import type { PaginatedResponse, Person } from './types'

/**
 * People search — `GET /discover/search?type=people`. There is no follow
 * *suggestions* endpoint; the onboarding follow-suggestions step is built on
 * this search, deliberately not styled as "suggested for you".
 */
export async function searchPeople(query: string): Promise<PaginatedResponse<Person>> {
  const res = await client.get('/discover/search', { params: { q: query, type: 'people' } })
  return res.data
}
