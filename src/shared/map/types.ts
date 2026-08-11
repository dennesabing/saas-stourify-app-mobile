/**
 * The app's map vocabulary.
 *
 * Nothing here names a map library, and that is the whole point: these are the
 * nouns Stourify screens already think in — a place, a pin, how far around you
 * are looking. The current engine is swapped for MapLibre post-beta (offline
 * map packs are the flagship Pro feature), and every type below is expressible
 * against either.
 *
 * The engine's own vocabulary — `latitudeDelta`, `<Marker>`, `pinColor`,
 * `animateToRegion` — lives in `MapCanvas.tsx` and nowhere else.
 */

/** A point on the earth. Same shape both engines happen to use; no import needed. */
export interface MapCoordinate {
  latitude: number
  longitude: number
}

/**
 * What a pin *is*, not what it looks like.
 *
 * A screen saying `kind: 'you'` survives a redesign and an engine swap; a
 * screen saying `pinColor="blue"` survives neither.
 */
export type MapPinKind = 'spot' | 'you'

export interface MapPin {
  /** Stable identity — a spot uuid in practice. Selection is by this id. */
  id: string
  coordinate: MapCoordinate
  /** Shown by the engine's own callout when the pin is tapped. */
  title?: string
  kind: MapPinKind
}

/**
 * What the map is looking at: a centre and how far around it to show.
 *
 * Kilometres rather than degree deltas or a zoom level, because those are each
 * one engine's private unit and kilometres are what the product already talks
 * in — `NearbyScreen` has a km radius selector on screen. The wrapper converts.
 */
export interface MapRegion {
  center: MapCoordinate
  radiusKm: number
}
