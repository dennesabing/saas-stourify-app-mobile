import { spotPins } from '@/shared/map'
import type { Spot } from '@/shared/api/types'

/**
 * STOURIFY-240 — which spots may be drawn on a map.
 *
 * A spot whose contributor hid its location arrives with no `latitude` and no
 * `longitude` at all: STOURIFY-185 omits the keys rather than nulling them, so
 * that a client can tell "no position available" from a real one. A pin built
 * from an absent coordinate is a pin at `(0, 0)` — the Atlantic — which is
 * both wrong and, worse, plausible.
 */
function spot(overrides: Partial<Spot> = {}): Spot {
  return {
    uuid: 'plaza',
    title: 'Plaza Heneral Santos',
    slug: 'plaza',
    latitude: 6.1164,
    longitude: 125.1716,
    status: 'published',
    is_verified: false,
    ...overrides,
  }
}

it('makes one pin per spot that has a position', () => {
  const pins = spotPins([spot(), spot({ uuid: 'oval', title: 'Oval Plaza', latitude: 6.1264 })])

  expect(pins).toEqual([
    {
      id: 'plaza',
      coordinate: { latitude: 6.1164, longitude: 125.1716 },
      title: 'Plaza Heneral Santos',
      kind: 'spot',
    },
    {
      id: 'oval',
      coordinate: { latitude: 6.1264, longitude: 125.1716 },
      title: 'Oval Plaza',
      kind: 'spot',
    },
  ])
})

it('drops a spot the server sent with no coordinates', () => {
  const pins = spotPins([
    spot(),
    spot({ uuid: 'hidden', title: 'Hidden Cove', latitude: undefined, longitude: undefined }),
  ])

  expect(pins.map((pin) => pin.id)).toEqual(['plaza'])
})

it('drops a spot that has one coordinate and not the other', () => {
  // Not a shape the server produces today. It is dropped anyway, because half
  // a position is not a position, and the alternative is a pin on the equator.
  const pins = spotPins([spot({ uuid: 'half', longitude: undefined })])

  expect(pins).toEqual([])
})

it('keeps a spot at 0, 0, which is a real place', () => {
  // The equator and the prime meridian. A truthiness check would drop this
  // one and look correct doing it (STOURIFY-65).
  const pins = spotPins([spot({ uuid: 'null-island', latitude: 0, longitude: 0 })])

  expect(pins).toHaveLength(1)
  expect(pins[0].coordinate).toEqual({ latitude: 0, longitude: 0 })
})
