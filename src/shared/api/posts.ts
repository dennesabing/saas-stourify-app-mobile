import { client } from './client'
import { addReaction, removeReaction } from './reactions'
import type { PaginatedResponse, Post } from './types'

/**
 * `GET /posts` — every post visible to the caller.
 *
 * `mine` narrows it to the caller's own, which is what the own-profile grid
 * wants; without it the grid shows the whole visible corpus.
 */
export async function getPosts(params?: { mine?: boolean }): Promise<PaginatedResponse<Post>> {
  const res = await client.get('/posts', {
    params: params?.mine ? { mine: 1 } : {},
  })
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
  /**
   * A name the CLIENT puts on this request, so the server can recognise a
   * retry of it instead of making a second post.
   *
   * It exists because the post's id is minted server-side: between the server
   * committing and this app writing that id down there is an instant in which
   * a crash loses the id while the post survives, and the next attempt makes
   * another one (STOURIFY-166). Nothing here can close that window — the app
   * cannot know an id it has not been told.
   *
   * Optional, and only the send-later queue sends one: it is the only caller
   * that retries, and the only one holding something durable enough to derive
   * a key from. A key that is not identical on every attempt does nothing at
   * all, so it must come from stored state, never from `Date.now()` or a fresh
   * random value.
   */
  idempotency_key?: string
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

/**
 * The short, stable name the server knows a post by when it is the target of
 * something generic — a like, a comment, a report. Registered in the module's
 * morph map; never a class name, which no client should have to know.
 */
export const POST_REACTABLE_TYPE = 'stourify_post'

/**
 * Set — not toggle — whether the caller likes a post. `liked` is the state you
 * want to end up in.
 *
 * There is no `/posts/{uuid}/like` route and there never has been. Liking goes
 * through the platform's one generic door, `/api/v1/reactions`, which addresses
 * any record by its type name plus its UUID; a post opts into it exactly the way
 * a Spot About entry does. `toggleLike` used to call the nested route instead,
 * which meant every tap of the heart on the feed 404'd from the app's first
 * commit in April 2026 until STOURIFY-149 — invisibly, because both screens flip
 * the heart in their own cache before the request goes out and put it back on
 * error, so the failure looked like one red frame.
 *
 * **It states an intention rather than flipping**, for the reason
 * `shared/api/reactions.ts` spells out: the server reads a second POST of a
 * reaction you already hold as "take it back", so a toggle hands the decision to
 * whichever side has the staler idea of the truth — usually the app. If another
 * device liked this post a second ago, a toggle would turn "like this" into
 * "unlike this".
 *
 * The `{ liked, likes_count }` it returns is the server's own count afterwards,
 * so a caller can reconcile an optimistic guess against it. `counts.like` is
 * absent rather than zero once the last like is gone, which is why the zero is
 * supplied here.
 */
export async function setPostLike(
  postUuid: string,
  liked: boolean,
): Promise<{ liked: boolean; likes_count: number }> {
  const state = liked
    ? await addReaction(POST_REACTABLE_TYPE, postUuid)
    : await removeReaction(POST_REACTABLE_TYPE, postUuid)

  return { liked: state.reacted, likes_count: state.counts.like ?? 0 }
}

/**
 * One explorer's posts — the other-user profile grid.
 *
 * A filter on the post index, not a `/users/{uuid}/posts` route (which has
 * never existed). The server applies its visibility scope first, so this
 * returns only what the caller may already see: no unpublished work, and no
 * followers-only posts unless the caller is an accepted follower.
 */
export async function getUserPosts(userUuid: string): Promise<PaginatedResponse<Post>> {
  const res = await client.get('/posts', { params: { user_uuid: userUuid } })
  return res.data
}
