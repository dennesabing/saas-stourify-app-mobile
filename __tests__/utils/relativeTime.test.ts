import { formatRelativeTime } from '@/shared/utils/relativeTime'

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
