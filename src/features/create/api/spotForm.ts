import type { MapCoordinate } from '@/shared/map'

/**
 * The new-spot form's rules, as one function.
 *
 * These are the server's rules, restated. `SpotStoreRequest` is the authority —
 * this is a copy that exists because a spot is written to the local database
 * first and pushed later: a shape the server refuses would otherwise fail
 * minutes after the person who typed it has put the phone away, with no screen
 * left to show them the message. The queue is the reason for the duplication,
 * not any doubt about the server.
 *
 * Kept out of the screen and out of a component so the boundaries are
 * assertable without rendering anything.
 *
 * When these numbers change, they change in
 * `modules/Stourify/src/Http/Requests/SpotStoreRequest.php` first.
 */

export const MIN_SPOT_TITLE = 3
export const MAX_SPOT_TITLE = 255
export const MAX_SPOT_DESCRIPTION = 5000
export const MAX_SPOT_CATEGORIES = 10
export const MAX_SPOT_CATEGORY_LENGTH = 40

export interface SpotFormValues {
  title: string
  description: string
  /** `null` until a position has been captured or a pin has been dropped. */
  coordinate: MapCoordinate | null
  categories: string[]
}

/**
 * The first thing wrong with the form, in words a person can act on — or `null`
 * when there is nothing wrong with it.
 *
 * One message rather than a per-field map, because the screen shows one line:
 * a form this short does not need a field-by-field error display, and inventing
 * one would mean deciding where each message renders for no gain.
 */
export function validateSpotForm({
  title,
  description,
  coordinate,
  categories,
}: SpotFormValues): string | null {
  const trimmedTitle = title.trim()

  if (trimmedTitle.length < MIN_SPOT_TITLE) {
    return `A spot needs a name of at least ${MIN_SPOT_TITLE} characters.`
  }

  if (trimmedTitle.length > MAX_SPOT_TITLE) {
    return `That name is too long — keep it under ${MAX_SPOT_TITLE} characters.`
  }

  if (description.trim().length > MAX_SPOT_DESCRIPTION) {
    return `That description is too long — keep it under ${MAX_SPOT_DESCRIPTION.toLocaleString('en-US')} characters.`
  }

  // The screen offers no way to type a coordinate, so in practice this fires
  // when the position never arrived and no pin was moved.
  if (coordinate === null) {
    return 'Pick the location on the map before publishing.'
  }

  if (!isWithin(coordinate.latitude, -90, 90)) {
    return 'That location is off the map — latitude has to be between -90 and 90.'
  }

  if (!isWithin(coordinate.longitude, -180, 180)) {
    return 'That location is off the map — longitude has to be between -180 and 180.'
  }

  if (categories.length > MAX_SPOT_CATEGORIES) {
    return `Pick at most ${MAX_SPOT_CATEGORIES} categories.`
  }

  if (categories.some((category) => category.trim().length > MAX_SPOT_CATEGORY_LENGTH)) {
    return `A category has to be ${MAX_SPOT_CATEGORY_LENGTH} characters or fewer.`
  }

  return null
}

function isWithin(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max
}
