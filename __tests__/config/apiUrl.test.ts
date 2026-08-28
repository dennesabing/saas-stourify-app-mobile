/**
 * STOURIFY-232 — a build that was told nothing must never guess production.
 *
 * The app reads which backend to talk to from `EXPO_PUBLIC_API_URL`. The
 * question this file pins is what happens when nobody set it. The old answer
 * was "use the production address unless this is a development build", and the
 * trap is that `__DEV__` does not mean "development build" — it is false for a
 * `releaseDev` APK exactly as it is for a production one. So a test build with
 * a missing variable pointed at real users' data, and nothing on screen said so.
 *
 * The answer now is: development builds keep the emulator loopback default, and
 * anything else refuses to start.
 */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

import { DEV_FALLBACK_API_URL, resolveApiUrl } from '@/shared/config/apiUrl'

describe('resolveApiUrl', () => {
  it('uses the address it was given', () => {
    expect(resolveApiUrl('https://backend.example.test/api/v1', false)).toBe(
      'https://backend.example.test/api/v1',
    )
    expect(resolveApiUrl('https://backend.example.test/api/v1', true)).toBe(
      'https://backend.example.test/api/v1',
    )
  })

  it('falls back to the emulator loopback in a development build', () => {
    expect(resolveApiUrl(undefined, true)).toBe(DEV_FALLBACK_API_URL)
    expect(DEV_FALLBACK_API_URL).toBe('http://10.0.2.2:8000/api/v1')
  })

  // The heart of the card. A release-family build with no address refuses,
  // rather than picking one and sending real traffic to it.
  it('refuses rather than guessing in a release-family build', () => {
    expect(() => resolveApiUrl(undefined, false)).toThrow(/EXPO_PUBLIC_API_URL/)
  })

  it('never guesses the production backend', () => {
    let message = ''
    try {
      resolveApiUrl(undefined, false)
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).not.toBe('')
    // The address must not even appear as a suggestion in the failure text —
    // a message that names it is one copy-paste away from re-creating the bug.
    expect(message).not.toContain('api.stourify.com')
  })

  // `??` only catches null and undefined, so `EXPO_PUBLIC_API_URL=` in a .env
  // file used to produce an app with an empty base URL and no complaint at all.
  it('treats an empty value as no value', () => {
    expect(resolveApiUrl('', true)).toBe(DEV_FALLBACK_API_URL)
    expect(() => resolveApiUrl('', false)).toThrow(/EXPO_PUBLIC_API_URL/)
  })
})

/**
 * The other half of the card: the rule used to be written out in three separate
 * files, so "fixing it" in one of them would have left two behind. These
 * assertions read the app's own source and fail if a second copy ever appears —
 * the same technique `__tests__/android/apiUrlGuard.test.ts` already uses to
 * pin the Gradle guard.
 */
describe('the rule lives in exactly one place', () => {
  const SRC = join(__dirname, '..', '..', 'src')
  const OWNER = join('shared', 'config', 'apiUrl.ts')

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) return sourceFiles(full)
      return /\.tsx?$/.test(entry.name) ? [full] : []
    })
  }

  const files = sourceFiles(SRC).map((path) => ({
    path,
    relative: path.slice(SRC.length + 1),
    text: readFileSync(path, 'utf8'),
  }))

  it('finds the app source it is supposed to be scanning', () => {
    expect(files.length).toBeGreaterThan(20)
    expect(files.some((file) => file.relative === OWNER)).toBe(true)
  })

  it('has one file that reads the environment variable', () => {
    const readers = files
      .filter((file) => file.text.includes('process.env.EXPO_PUBLIC_API_URL'))
      .map((file) => file.relative)

    expect(readers).toEqual([OWNER])
  })

  it('has no file carrying the production address as a fallback', () => {
    const carriers = files
      .filter((file) => file.text.includes("'https://api.stourify.com/api/v1'"))
      .map((file) => file.relative)

    expect(carriers).toEqual([])
  })
})
