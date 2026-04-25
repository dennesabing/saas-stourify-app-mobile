import { client } from './client'
import type { PaginatedResponse, Post, Spot } from './types'

export async function getSpots(params?: {
  category?: string
  search?: string
}): Promise<PaginatedResponse<Spot>> {
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
