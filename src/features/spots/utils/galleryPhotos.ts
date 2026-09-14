import type { Post } from '@/shared/api/types'

/** The order the gallery is in: Most recent, or Top rated (most liked). */
export type GallerySort = 'recent' | 'top'

/** One tile: a spot's own photo (`post: null`) or a photo from a post about it. */
export interface GalleryPhoto {
  key: string
  url: string
  /** What the grid draws — the 400-point conversion, or the original until it exists. */
  thumb: string
  post: Post | null
}

/** The part of a photo the gallery reads, whichever list it came from. */
interface GalleryMedia {
  uuid: string
  url: string
  thumb_url?: string | null
}

/**
 * Every photo of a spot, in the order its gallery shows them (STOURIFY-293).
 *
 * The one rule for which photos those are. `PhotoGalleryScreen` draws this
 * list, and the spot page's "View all N photos" counts it — the two counted
 * separately once, and a page saying "View the photo" opened a gallery of three
 * (STOURIFY-310). Change the rule here and both follow.
 *
 * - The spot's own photos come first under Most recent, and last under Top
 *   rated, because they have no likes to rank by.
 * - Every photo on every post counts, not every post: a post can carry several
 *   photos, or none.
 * - A photo in both lists is one tile, wherever it first appears.
 */
export function galleryPhotos(
  spotMedia: readonly GalleryMedia[] | undefined,
  posts: readonly Post[] | undefined,
  sort: GallerySort,
): GalleryPhoto[] {
  const own: GalleryPhoto[] = (spotMedia ?? []).map((media) => ({
    key: media.uuid,
    url: media.url,
    thumb: media.thumb_url ?? media.url,
    post: null,
  }))

  const posted: GalleryPhoto[] = (posts ?? []).flatMap((post) =>
    (post.media ?? []).map((media) => ({
      key: media.uuid,
      url: media.url,
      thumb: media.thumb_url ?? media.url,
      post,
    })),
  )

  const ordered = sort === 'top' ? [...posted, ...own] : [...own, ...posted]

  const byKey = new Map<string, GalleryPhoto>()
  for (const photo of ordered) if (!byKey.has(photo.key)) byKey.set(photo.key, photo)
  return Array.from(byKey.values())
}
