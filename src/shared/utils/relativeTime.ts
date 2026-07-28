const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'} ago`
}

/**
 * Relative time for the sync banner.
 *
 * `now` is a parameter, not `Date.now()` — the caller owns the clock so tests
 * are deterministic and a re-render can refresh the string without this module
 * holding a timer.
 *
 * A future `at` (clock skew between the device and the server timestamp we
 * record) clamps to "just now" rather than rendering "-3 minutes ago".
 */
export function formatRelativeTime(at: number | null, now: number): string {
  if (at === null) return 'never'

  const elapsed = Math.max(0, now - at)

  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), 'minute')
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), 'hour')

  return plural(Math.floor(elapsed / DAY), 'day')
}
