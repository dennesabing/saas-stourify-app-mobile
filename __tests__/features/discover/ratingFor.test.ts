import { ratingFor } from '@/features/discover/api/exploreSpots'
import type { Spot } from '@/shared/api/types'

/**
 * STOURIFY-259 — an unreviewed spot must not read as "★ 0.0".
 *
 * The server sends `rating_average: 0` for a spot nobody has reviewed, so a
 * plain null check printed a zero rating under every new spot on the emulator —
 * which reads as "rated terribly", not "not rated yet". Every Discover surface
 * reads the rating through this one rule.
 */
function spot(fields: Partial<Spot>): Spot {
  return {
    uuid: 'spot-1',
    title: 'Test Spot',
    slug: 'test-spot',
    status: 'published',
    ...fields,
  } as Spot
}

it('shows the rating of a spot that has reviews', () => {
  expect(ratingFor(spot({ rating_average: 4.8, reviews_count: 12 }))).toBe(4.8)
})

it('hides the zero the server sends for a spot nobody has reviewed', () => {
  expect(ratingFor(spot({ rating_average: 0, reviews_count: 0 }))).toBeNull()
})

it('hides a missing rating even when reviews are counted', () => {
  expect(
    ratingFor(spot({ rating_average: null as unknown as number, reviews_count: 3 })),
  ).toBeNull()
})

it('treats a missing review count as no reviews', () => {
  expect(ratingFor(spot({ rating_average: 4.2 }))).toBeNull()
})
