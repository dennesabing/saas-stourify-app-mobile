const DAY = 24 * 60 * 60_000

export type RecencyGroup = 'Today' | 'This week' | 'Earlier'

/**
 * Which of the Activity artboard's group labels a moment sits under
 * (STOURIFY-262): "Today" and "This week" as the design draws them, plus
 * "Earlier", because a follow request can wait for weeks and filing it under
 * "This week" would be untrue.
 *
 * "Today" is the phone's calendar day, not the last 24 hours — a request sent
 * at 23:59 last night reads as yesterday to the person holding the phone.
 * "This week" is the seven days before `now`.
 *
 * `now` is a parameter for the same reason `shortRelativeTime` takes one: the
 * caller owns the clock. A future `at` (clock skew) clamps to Today, the same
 * clamp as there; an unreadable one (`Date.parse` answers `NaN`) lands in
 * Earlier rather than claiming to be recent.
 */
export function recencyGroup(at: number, now: number): RecencyGroup {
  if (!Number.isFinite(at)) return 'Earlier'

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)

  if (at >= startOfToday.getTime()) return 'Today'
  if (now - at < 7 * DAY) return 'This week'

  return 'Earlier'
}
