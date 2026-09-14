import { galleryPhotos } from '@/features/spots/utils/galleryPhotos'
import type { Post } from '@/shared/api/types'

/**
 * The one rule for which photos a spot's gallery holds (STOURIFY-310). The
 * gallery draws this list and the spot page's "View all N photos" counts it,
 * so the two cannot disagree.
 */

function media(uuid: string, thumb: string | null = null) {
  return { uuid, url: `https://cdn.test/${uuid}.jpg`, thumb_url: thumb } as any
}

function post(uuid: string, mediaUuids: string[]): Post {
  return { uuid, likes_count: 0, media: mediaUuids.map((m) => media(m)) } as unknown as Post
}

it("puts the spot's own photos first, then every photo on every post", () => {
  const photos = galleryPhotos(
    [media('own-1'), media('own-2')],
    [post('p1', ['p1a', 'p1b']), post('p2', ['p2a'])],
    'recent',
  )

  expect(photos.map((photo) => photo.key)).toEqual(['own-1', 'own-2', 'p1a', 'p1b', 'p2a'])
  expect(photos[0].post).toBeNull()
  expect(photos[2].post?.uuid).toBe('p1')
})

it("puts the spot's own photos last under Top rated, since they have no likes", () => {
  const photos = galleryPhotos([media('own-1')], [post('p1', ['p1a'])], 'top')

  expect(photos.map((photo) => photo.key)).toEqual(['p1a', 'own-1'])
})

it('shows a photo that is on the spot and on a post once, where it first appears', () => {
  const photos = galleryPhotos([media('shared')], [post('p1', ['shared', 'p1a'])], 'recent')

  expect(photos.map((photo) => photo.key)).toEqual(['shared', 'p1a'])
  expect(photos[0].post).toBeNull()
})

it('counts a post with no photos as nothing', () => {
  expect(galleryPhotos([], [post('p1', [])], 'recent')).toEqual([])
})

it('draws the thumbnail when there is one, and the original until then', () => {
  const [withThumb, without] = galleryPhotos(
    [media('a', 'https://cdn.test/a-400.jpg'), media('b')],
    undefined,
    'recent',
  )

  expect(withThumb.thumb).toBe('https://cdn.test/a-400.jpg')
  expect(without.thumb).toBe(without.url)
})
