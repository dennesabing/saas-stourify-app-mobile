import { client } from './client'
import type { PaginatedResponse, Post } from './types'

export async function getPosts(): Promise<PaginatedResponse<Post>> {
  const res = await client.get('/posts')
  return res.data
}

export async function getPost(uuid: string): Promise<Post> {
  const res = await client.get(`/posts/${uuid}`)
  return res.data.data
}

/**
 * Exactly the keys `PostStoreRequest` validates, and nothing else — Laravel
 * discards anything it has no rule for, without erroring, so an extra key here
 * is a silent no-op rather than a 422 (STOURIFY-2, STOURIFY-18).
 */
export interface CreatePostInput {
  caption?: string
  visibility: Post['visibility']
  spot_uuid?: string
  /**
   * `publish` rather than a `published_at` the client picks: the server owns
   * that clock. A post is created unpublished while its photos upload, and
   * `publishPost` finishes it — see `PostStoreRequest`'s docblock.
   */
  publish?: boolean
}

/**
 * `POST /posts` — JSON, never multipart. Photos go through the presign flow
 * against the returned post (`features/social/api/uploadPostMedia.ts`).
 */
export async function createPost(input: CreatePostInput): Promise<Post> {
  const res = await client.post('/posts', input)
  return res.data.data
}

/**
 * `POST /posts/{uuid}/publish` — idempotent server-side, so a retry after a
 * dropped response is safe and does not move the post up the feed.
 */
export async function publishPost(uuid: string): Promise<Post> {
  const res = await client.post(`/posts/${uuid}/publish`)
  return res.data.data
}

export async function deletePost(uuid: string): Promise<void> {
  await client.delete(`/posts/${uuid}`)
}

export async function toggleLike(postUuid: string): Promise<{ liked: boolean; likes_count: number }> {
  const res = await client.post(`/posts/${postUuid}/like`)
  return res.data.data
}

export async function getUserPosts(userUuid: string): Promise<PaginatedResponse<Post>> {
  const res = await client.get(`/users/${userUuid}/posts`)
  return res.data
}
