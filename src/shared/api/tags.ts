import { client } from './client'
import type { PaginatedResponse, Post, Spot, Tag } from './types'

/**
 * Hashtags — the read side, delivered by STOURIFY-172.
 *
 * ## Why looking a tag up is its own request
 *
 * A tag page needs to tell three situations apart, and a listing on its own can
 * only tell two:
 *
 * - the tag exists and nothing carries it → *nothing tagged #x yet*
 * - there is no such tag → *no such tag*
 * - the request failed → *could not load, try again*
 *
 * Ask only for the listing and the first two are the same empty array — and a
 * screen that treats a failure as "no results" folds the third in with them.
 * That is the defect STOURIFY-85 to STOURIFY-90 are about, and this endpoint's
 * `404` is what makes the distinction available at all.
 */

/**
 * `GET /discover/tags/{slug}` — one hashtag, by the word itself.
 *
 * Throws on `404`, like every other call in this layer; the caller distinguishes
 * *no such tag* from *could not reach the server* by looking at the status.
 */
export async function getTag(slug: string): Promise<Tag> {
  const res = await client.get(`/discover/tags/${encodeURIComponent(slug)}`)
  return res.data.data
}

/**
 * The posts carrying one hashtag.
 *
 * This is the ordinary post listing with one more filter on it, not an endpoint
 * of its own — so it applies exactly the audience rule the feed applies, and
 * cannot show a post the caller was not already entitled to see.
 */
export async function getPostsByTag(slug: string): Promise<PaginatedResponse<Post>> {
  const res = await client.get('/posts', { params: { tag: slug } })
  return res.data
}

/** The spots carrying one hashtag. Same arrangement as {@link getPostsByTag}. */
export async function getSpotsByTag(slug: string): Promise<PaginatedResponse<Spot>> {
  const res = await client.get('/spots', { params: { tag: slug } })
  return res.data
}
