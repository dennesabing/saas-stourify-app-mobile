import type { Spot } from '@/shared/api/types'
import type { MapPin } from './types'

/**
 * Turn spots into map pins, dropping the ones that cannot honestly be placed.
 *
 * A spot arrives without `latitude` and `longitude` when its contributor
 * turned off `shows_location_on_spots` — the server omits both keys rather
 * than nulling them (STOURIFY-185), so the app can tell an unavailable
 * position from a real one. Without this filter such a spot becomes a pin at
 * `(undefined, undefined)`, which the map engine reads as `(0, 0)`: a real
 * place in the Atlantic, a hemisphere away from everything else on screen.
 *
 * The spot itself is not discarded — only its pin. Every screen that shows a
 * list beside the map keeps the spot in the list, because a place with no
 * position is still a place.
 *
 * `typeof === 'number'` rather than truthiness, because latitude 0 is the
 * equator and longitude 0 is Greenwich (STOURIFY-65).
 *
 * Written once and used by both map screens (STOURIFY-240): the rule about
 * which spots may be drawn is one rule, and two copies of it are two rules
 * that agree until somebody edits one.
 */
export function spotPins(spots: Spot[]): MapPin[] {
  const pins: MapPin[] = []

  for (const spot of spots) {
    const { latitude, longitude } = spot
    if (typeof latitude !== 'number' || typeof longitude !== 'number') continue

    pins.push({
      id: spot.uuid,
      coordinate: { latitude, longitude },
      title: spot.title,
      kind: 'spot',
    })
  }

  return pins
}
