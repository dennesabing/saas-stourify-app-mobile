import { client } from './client'
import type { PaginatedResponse, Post, Spot } from './types'

/**
 * `q` is the server's parameter name (`SpotIndexRequest`), not `search`.
 *
 * This took `search` until 2026-07-29, and because Laravel silently drops
 * unknown query parameters, every search returned the unfiltered spot list
 * with no error anywhere. `SpotIndexRequest` has no `category` rule at all, so
 * the category filter never existed either — it is not accepted here rather
 * than pretending to work. Filtering by category needs a server-side rule
 * first.
 */
export async function getSpots(params?: { q?: string }): Promise<PaginatedResponse<Spot>> {
  const res = await client.get('/spots', { params })
  return res.data
}

export async function getSpot(uuid: string): Promise<Spot> {
  const res = await client.get(`/spots/${uuid}`)
  return res.data.data
}

export async function getSpotPosts(uuid: string): Promise<PaginatedResponse<Post>> {
  const res = await client.get(`/spots/${uuid}/posts`)
  return res.data
}

/**
 * `title` is the server's field name (`SpotStoreRequest`), not `name`.
 *
 * This posted `name` until 2026-08-11, and `title` is `required` there — so the
 * first caller would have got a 422 complaining about a field it had never
 * heard of, with `name` dropped silently alongside. Nothing called this yet,
 * which is the only reason it was a trap rather than an outage.
 *
 * The body is spelled out rather than forwarded, so the wire contract is
 * asserted by the test instead of being whatever the caller happened to pass.
 */
export async function createSpot(data: {
  title: string
  latitude: number
  longitude: number
  description?: string
}): Promise<Spot> {
  const res = await client.post('/spots', {
    title: data.title,
    latitude: data.latitude,
    longitude: data.longitude,
    description: data.description,
  })
  return res.data.data
}
