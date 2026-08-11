import * as Location from 'expo-location'
import type { MapCoordinate } from '@/shared/map'

/**
 * Reading where the phone is, with the two ways it goes wrong kept apart.
 *
 * Asking a phone for its position is like asking someone to point at their own
 * house from a moving bus: sometimes they refuse, and sometimes they mean to
 * answer and never quite manage it. Those are different problems and need
 * different words on screen, so this returns which one happened instead of one
 * boolean.
 */

/**
 * How long to wait for a live fix before settling for the last one the device
 * recorded.
 *
 * A timeout rather than a `.catch`, because the failure it guards against does
 * not reject: on an emulator whose fused provider is fed a mock position,
 * `getCurrentPositionAsync` simply never settles, so an error handler is never
 * reached and the screen sits on its spinner forever. That is not only an
 * emulator quirk — a phone indoors behaves the same way.
 */
export const POSITION_TIMEOUT_MS = 8000

export interface PositionFix {
  coordinate: MapCoordinate
  /** How far off the fix may be, in metres. `null` when the device won't say. */
  accuracyMeters: number | null
}

export type PositionResult =
  /** Permission granted. `fix` is `null` when no position could be produced. */
  | { status: 'granted'; fix: PositionFix | null }
  /** The viewer said no, or the OS did. */
  | { status: 'denied' }

function toFix(position: Location.LocationObject | null): PositionFix | null {
  if (!position) return null

  const { latitude, longitude, accuracy } = position.coords

  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null

  return {
    coordinate: { latitude, longitude },
    accuracyMeters: typeof accuracy === 'number' ? accuracy : null,
  }
}

/** A live fix if one arrives in time, else the last one the device recorded. */
export async function readPosition(): Promise<PositionFix | null> {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    const current = await Promise.race([
      Location.getCurrentPositionAsync({}),
      new Promise<Location.LocationObject | null>((resolve) => {
        timer = setTimeout(() => resolve(null), POSITION_TIMEOUT_MS)
      }),
    ])

    const fix = toFix(current)
    if (fix) return fix
  } catch {
    // No live fix. The last known position may still be usable.
  } finally {
    if (timer) clearTimeout(timer)
  }

  try {
    return toFix(await Location.getLastKnownPositionAsync())
  } catch {
    return null
  }
}

/**
 * Ask for permission, then for a position. One call, because a caller has no
 * use for one without the other, and the order is not theirs to get wrong.
 */
export async function requestPosition(): Promise<PositionResult> {
  let granted = false

  try {
    const { status } = await Location.requestForegroundPermissionsAsync()
    granted = status === 'granted'
  } catch {
    // A permission request that throws is a refusal as far as any screen is
    // concerned: there is no position coming either way.
    granted = false
  }

  if (!granted) return { status: 'denied' }

  return { status: 'granted', fix: await readPosition() }
}
