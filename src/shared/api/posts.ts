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

export async function createPost(formData: FormData): Promise<Post> {
  const res = await client.post('/posts', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
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
