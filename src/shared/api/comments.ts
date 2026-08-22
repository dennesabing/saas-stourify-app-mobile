import { client } from './client'
import type { Comment, PaginatedResponse } from './types'

export async function getComments(postUuid: string): Promise<PaginatedResponse<Comment>> {
  const res = await client.get(`/posts/${postUuid}/comments`)
  return res.data
}

export async function createComment(postUuid: string, body: string): Promise<Comment> {
  const res = await client.post(`/posts/${postUuid}/comments`, { body })
  return res.data.data
}

export async function deleteComment(commentUuid: string): Promise<void> {
  await client.delete(`/comments/${commentUuid}`)
}

/**
 * The comment thread on one Spot About entry — a note somebody pinned to a
 * spot's corkboard, and the conversation in the margin next to it.
 *
 * These sit here rather than in `spotAbouts.ts` because this file is the app's
 * comment surface, not the post surface: `deleteComment` above is the
 * platform's own endpoint and is not a post route either. Keeping every
 * comment call in one module is what lets `CommentsScreen` pick its endpoints
 * from a single import when it is opened on one host or the other.
 *
 * The entry is addressed by UUID. The platform's generic comment endpoint
 * wants a numeric database id, which no Stourify response contains, so the
 * module puts a small translating controller in front of it — the same one
 * posts already have (STOURIFY-146; `specs/2026-08-22-spot-about-design.md`
 * §2.3).
 */
export async function getSpotAboutComments(spotAboutUuid: string): Promise<PaginatedResponse<Comment>> {
  const res = await client.get(`/spot-abouts/${spotAboutUuid}/comments`)
  return res.data
}

export async function createSpotAboutComment(spotAboutUuid: string, body: string): Promise<Comment> {
  const res = await client.post(`/spot-abouts/${spotAboutUuid}/comments`, { body })
  return res.data.data
}
