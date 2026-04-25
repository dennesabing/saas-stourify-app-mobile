import { client } from './client'
import type { Follow, PaginatedResponse } from './types'

export async function getFollowers(userUuid: string): Promise<PaginatedResponse<Follow>> {
  const res = await client.get(`/users/${userUuid}/followers`)
  return res.data
}

export async function getFollowing(userUuid: string): Promise<PaginatedResponse<Follow>> {
  const res = await client.get(`/users/${userUuid}/following`)
  return res.data
}

export async function follow(userUuid: string): Promise<Follow> {
  const res = await client.post(`/users/${userUuid}/follow`)
  return res.data.data
}

export async function unfollow(userUuid: string): Promise<void> {
  await client.delete(`/users/${userUuid}/follow`)
}

export async function acceptFollowRequest(followUuid: string): Promise<Follow> {
  const res = await client.post(`/follow-requests/${followUuid}/accept`)
  return res.data.data
}

export async function declineFollowRequest(followUuid: string): Promise<void> {
  await client.delete(`/follow-requests/${followUuid}`)
}
