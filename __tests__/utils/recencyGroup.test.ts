import { recencyGroup } from '@/features/activity/recencyGroup'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

// Built from local fields, not an ISO string: "Today" is a question about the
// phone's own calendar, so the test has to ask it in the same terms.
const now = new Date(2026, 8, 11, 9, 0).getTime()

describe('recencyGroup', () => {
  it('puts anything from earlier today under Today', () => {
    expect(recencyGroup(new Date(2026, 8, 11, 0, 5).getTime(), now)).toBe('Today')
    expect(recencyGroup(now - MINUTE, now)).toBe('Today')
  })

  it('puts yesterday under This week, even when it was only hours ago', () => {
    expect(recencyGroup(new Date(2026, 8, 10, 23, 59).getTime(), now)).toBe('This week')
  })

  it('keeps the last seven days under This week and anything older under Earlier', () => {
    expect(recencyGroup(now - 6 * DAY, now)).toBe('This week')
    expect(recencyGroup(now - 7 * DAY + MINUTE, now)).toBe('This week')
    expect(recencyGroup(now - 7 * DAY, now)).toBe('Earlier')
    expect(recencyGroup(now - 30 * DAY, now)).toBe('Earlier')
  })

  it('treats a time slightly in the future as Today, the same clamp as shortRelativeTime', () => {
    expect(recencyGroup(now + 5 * MINUTE, now)).toBe('Today')
  })

  it('files an unreadable time under Earlier rather than claiming it is recent', () => {
    expect(recencyGroup(Number.NaN, now)).toBe('Earlier')
  })
})
