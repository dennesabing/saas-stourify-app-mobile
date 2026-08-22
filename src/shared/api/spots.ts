import { client } from './client'
import type { PaginatedResponse, Post, Spot } from './types'

/**
 * `q` is the server's parameter name (`SpotIndexRequest`), not `search`.
 *
 * This took `search` until 2026-07-29, and because Laravel silently drops
 * unknown query parameters, every search returned the unfiltered spot list
 * with no error anywhere. `SpotIndexRequest` has no `category` rule at all, so
 * the category filter never existed either — it is not accepted here rather
 * than pretending to work. Filtering by category needs a server-side rule
 * first.
 */
export async function getSpots(params?: { q?: string }): Promise<PaginatedResponse<Spot>> {
  const res = await client.get('/spots', { params })
  return res.data
}

/**
 * Spots around a point, closest first.
 *
 * `GET /spots/nearby` is the only proximity route the server has ever
 * registered. `getNearbyFeed` in `feed.ts` called `/feed/nearby` until
 * STOURIFY-8 — a route that does not exist, whose 404 the screen rendered as
 * "No spots nearby", so Nearby had never shown real data.
 *
 * The parameter names are `SpotNearbyRequest`'s: `lat`, `lng`, `radius`,
 * `per_page`, `page`. `radius` — not `radius_km`. Laravel drops unvalidated
 * query parameters without complaint, so a misspelling here does not fail, it
 * silently falls back to the server's default radius.
 *
 * Ordering is the server's (bounding box + planar distance, `Spot::scopeNearby`)
 * and is preserved as received; do not re-sort on the client.
 */
export async function getNearbySpots(
  lat: number,
  lng: number,
  radius: number,
  page?: number,
): Promise<PaginatedResponse<Spot>> {
  const res = await client.get('/spots/nearby', {
    params: { lat, lng, radius, ...(page ? { page } : {}) },
  })
  return res.data
}

export async function getSpot(uuid: string): Promise<Spot> {
  const res = await client.get(`/spots/${uuid}`)
  return res.data.data
}

/**
 * The photos people have posted at one spot — the grid on a spot's page.
 *
 * A filter on the post index, not a `/spots/{uuid}/posts` route (which has
 * never existed). This asked for the nested path from the app's first commit
 * on 2026-04-25 until STOURIFY-155, so every request 404'd and the grid was
 * empty on every spot for about four months. It never looked broken: the
 * screen fetches the spot's own details in a SEPARATE request that works, so
 * the page rendered fine and an empty grid reads as a quiet place.
 *
 * `spot_uuid` is the name `PostIndexRequest` validates. Laravel drops a query
 * parameter it has no rule for without complaining, so a misspelling here
 * would not fail — it would fill the grid with every post in the app.
 *
 * The server applies its visibility scope first, so this returns only what the
 * caller may already see, and orders by `published_at` newest-first. Twenty-
 * five to a page, and the screen renders the first page only.
 */
export async function getSpotPosts(uuid: string): Promise<PaginatedResponse<Post>> {
  const res = await client.get('/posts', { params: { spot_uuid: uuid } })
  return res.data
}

/**
 * `title` is the server's field name (`SpotStoreRequest`), not `name`.
 *
 * This posted `name` until 2026-08-11, and `title` is `required` there — so the
 * first caller would have got a 422 complaining about a field it had never
 * heard of, with `name` dropped silently alongside. Nothing called this yet,
 * which is the only reason it was a trap rather than an outage.
 *
 * The body is spelled out rather than forwarded, so the wire contract is
 * asserted by the test instead of being whatever the caller happened to pass.
 */
export async function createSpot(data: {
  title: string
  latitude: number
  longitude: number
  description?: string
}): Promise<Spot> {
  const res = await client.post('/spots', {
    title: data.title,
    latitude: data.latitude,
    longitude: data.longitude,
    description: data.description,
  })
  return res.data.data
}
