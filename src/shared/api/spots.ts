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

export async function createSpot(data: {
  name: string
  latitude: number
  longitude: number
  description?: string
}): Promise<Spot> {
  const res = await client.post('/spots', data)
  return res.data.data
}
