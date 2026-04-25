import { client } from './client'
import type { CursorPaginatedResponse, Post } from './types'

export async function getFollowingFeed(cursor?: string): Promise<CursorPaginatedResponse<Post>> {
  const res = await client.get('/feed', { params: cursor ? { cursor } : {} })
  return res.data
}

export async function getNearbyFeed(
  lat: number,
  lng: number,
  radius_km: number,
  cursor?: string
): Promise<CursorPaginatedResponse<Post>> {
  const res = await client.get('/feed/nearby', {
    params: { lat, lng, radius_km, ...(cursor ? { cursor } : {}) },
  })
  return res.data
}
