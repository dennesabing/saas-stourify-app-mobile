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
