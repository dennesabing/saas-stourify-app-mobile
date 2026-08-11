import { client } from './client'
import type { Follow, PaginatedResponse } from './types'

/**
 * The follow graph — `/api/v1/follows`.
 *
 * Every function here used to address a `/users/{uuid}/…` surface that has
 * never existed on the server (STOURIFY-35). The real API is a single
 * `follows` resource: one index with a `direction`, and edges addressed by
 * their own uuid.
 */

/**
 * One side of an explorer's graph. Omit `userUuid` for the caller's own.
 *
 * A private account's lists are visible only to the account itself and to its
 * accepted followers — a 403 here is a privacy answer, not an error.
 */
export async function getFollowers(userUuid?: string): Promise<PaginatedResponse<Follow>> {
  const res = await client.get('/follows', {
    params: { direction: 'followers', ...(userUuid ? { user_uuid: userUuid } : {}) },
  })
  return res.data
}

export async function getFollowing(userUuid?: string): Promise<PaginatedResponse<Follow>> {
  const res = await client.get('/follows', {
    params: { direction: 'following', ...(userUuid ? { user_uuid: userUuid } : {}) },
  })
  return res.data
}

/** Pending requests addressed to the caller — `follower` is the requester. */
export async function getFollowRequests(): Promise<PaginatedResponse<Follow>> {
  const res = await client.get('/follows/requests')
  return res.data
}

/**
 * Follow an explorer.
 *
 * The client sends only who to follow. Whether the edge lands `active` or
 * `pending` is decided by the TARGET's privacy setting server-side, so read
 * the returned `status` rather than assuming success means following.
 */
export async function follow(userUuid: string): Promise<Follow> {
  const res = await client.post('/follows', { user_uuid: userUuid })
  return res.data.data
}

/**
 * End the relationship — addressed by the EDGE's uuid, not the user's.
 *
 * The same call serves unfollowing, cancelling a pending request, rejecting
 * one, and removing a follower: they are one row and one operation. Get the
 * uuid from `ExplorerProfile.viewer.follow_uuid` or from a follow list row.
 */
export async function unfollow(followUuid: string): Promise<void> {
  await client.delete(`/follows/${followUuid}`)
}

export async function acceptFollowRequest(followUuid: string): Promise<Follow> {
  const res = await client.post(`/follows/${followUuid}/accept`)
  return res.data.data
}

/** Rejecting a request is the same delete as unfollowing — one row, one route. */
export async function declineFollowRequest(followUuid: string): Promise<void> {
  await client.delete(`/follows/${followUuid}`)
}
