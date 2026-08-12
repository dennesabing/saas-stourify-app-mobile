/**
 * The map seam.
 *
 * Screens import from here and never from a map library — see
 * `MapCanvas.tsx` for why, and `__tests__/shared/map/vendorIsolation.test.ts`
 * for the test that keeps it true. Nothing vendor-shaped is re-exported.
 */
export { default as MapCanvas } from './MapCanvas'
export type { MapCanvasProps } from './MapCanvas'
export type { MapCoordinate, MapPin, MapPinKind, MapRegion } from './types'
export { DEFAULT_MAP_CENTER, readFallbackCenter } from './fallbackCenter'
