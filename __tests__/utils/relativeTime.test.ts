import { formatRelativeTime, shortRelativeTime } from '@/shared/utils/relativeTime'

const NOW = 1_700_000_000_000

it('reads "just now" under a minute', () => {
  expect(formatRelativeTime(NOW, NOW)).toBe('just now')
  expect(formatRelativeTime(NOW - 59_000, NOW)).toBe('just now')
})

it('counts whole minutes', () => {
  expect(formatRelativeTime(NOW - 60_000, NOW)).toBe('1 minute ago')
  expect(formatRelativeTime(NOW - 12 * 60_000, NOW)).toBe('12 minutes ago')
})

it('counts whole hours', () => {
  expect(formatRelativeTime(NOW - 60 * 60_000, NOW)).toBe('1 hour ago')
  expect(formatRelativeTime(NOW - 5 * 60 * 60_000, NOW)).toBe('5 hours ago')
})

it('counts whole days', () => {
  expect(formatRelativeTime(NOW - 24 * 60 * 60_000, NOW)).toBe('1 day ago')
  expect(formatRelativeTime(NOW - 9 * 24 * 60 * 60_000, NOW)).toBe('9 days ago')
})

it('says never when there is no timestamp', () => {
  expect(formatRelativeTime(null, NOW)).toBe('never')
})

it('never renders a future timestamp as negative', () => {
  expect(formatRelativeTime(NOW + 30_000, NOW)).toBe('just now')
})

/**
 * The compact form a comment row prints beside a name — "2h", "45m" — as the
 * Home Feed design's Comments artboard draws it (STOURIFY-260). Same buckets and
 * the same clamp as the long form above, just fewer letters.
 */
describe('shortRelativeTime', () => {
  it('reads "just now" under a minute, and for a future timestamp', () => {
    expect(shortRelativeTime(NOW - 59_000, NOW)).toBe('just now')
    expect(shortRelativeTime(NOW + 30_000, NOW)).toBe('just now')
  })

  it('counts minutes, hours and days in one letter', () => {
    expect(shortRelativeTime(NOW - 45 * 60_000, NOW)).toBe('45m')
    expect(shortRelativeTime(NOW - 2 * 60 * 60_000, NOW)).toBe('2h')
    expect(shortRelativeTime(NOW - 3 * 24 * 60 * 60_000, NOW)).toBe('3d')
  })

  it('says nothing rather than "NaN" for a timestamp it cannot read', () => {
    expect(shortRelativeTime(Number.NaN, NOW)).toBe('')
  })
})
