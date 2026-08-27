import appJson from '../../../app.json'
import {
  evaluateManifest,
  fetchMinimumVersion,
  type ReleaseManifest,
} from '@/shared/update/minimumVersion'

/**
 * The rule this file pins, in one sentence: the app blocks itself ONLY when a
 * manifest it actually read says a number higher than its own.
 *
 * Everything else — an unreachable file, a slow one, a malformed one, one with
 * no floor in it at all — has to let the app through. A forced-update screen
 * that appears because a CDN had a bad minute is a worse outage than the one it
 * was built to prevent, and it would appear on every phone that opened the app
 * with no signal.
 */
describe('evaluateManifest', () => {
  const manifest = (extra: Partial<ReleaseManifest> = {}): ReleaseManifest => ({
    latest: '1.0.0',
    versions: [{ version: '1.0.0', version_code: 10, apk_url: 'https://cdn.example/1.0.0.apk' }],
    ...extra,
  })

  it('blocks a build below the floor', () => {
    expect(evaluateManifest(manifest({ min_version_code: 10 }), 9).supported).toBe(false)
  })

  it('lets a build exactly on the floor through — the floor is the oldest PERMITTED build', () => {
    expect(evaluateManifest(manifest({ min_version_code: 10 }), 10).supported).toBe(true)
  })

  it('lets a build above the floor through', () => {
    expect(evaluateManifest(manifest({ min_version_code: 10 }), 11).supported).toBe(true)
  })

  it('treats a manifest with no floor as no floor, never as a force', () => {
    // Every manifest published before the field existed looks like this. A
    // default that blocked would have stranded every install the day it shipped.
    expect(evaluateManifest(manifest(), 1).supported).toBe(true)
  })

  it('treats a zero floor as no floor', () => {
    expect(evaluateManifest(manifest({ min_version_code: 0 }), 1).supported).toBe(true)
  })

  it('ignores a floor that is not a number rather than guessing at it', () => {
    const bad = manifest({ min_version_code: 'twelve' as unknown as number })

    expect(evaluateManifest(bad, 1).supported).toBe(true)
  })

  it('carries the manifest message to the screen when it is blocking', () => {
    const result = evaluateManifest(
      manifest({ min_version_code: 10, update_message: 'Sync changed on 1 September.' }),
      9,
    )

    expect(result.supported).toBe(false)
    if (!result.supported) expect(result.message).toBe('Sync changed on 1 September.')
  })

  it('offers the download link from the manifest itself, not from the API host', () => {
    // The whole point of the feature: the person seeing this screen may be
    // unable to reach any Stourify server at all. A link to one would be the
    // original bug repeated one level down.
    const result = evaluateManifest(manifest({ min_version_code: 10 }), 9)

    expect(result.supported).toBe(false)
    if (!result.supported) expect(result.downloadUrl).toBe('https://cdn.example/1.0.0.apk')
  })

  it('names the newest version so the screen can say what to move to', () => {
    const result = evaluateManifest(manifest({ min_version_code: 10 }), 9)

    expect(result.supported).toBe(false)
    if (!result.supported) expect(result.latestVersion).toBe('1.0.0')
  })

  it('picks the link off the entry named by `latest`, not simply the first row', () => {
    const result = evaluateManifest(
      {
        latest: '2.0.0',
        min_version_code: 20,
        versions: [
          { version: '1.0.0', version_code: 10, apk_url: 'https://cdn.example/old.apk' },
          { version: '2.0.0', version_code: 20, apk_url: 'https://cdn.example/new.apk' },
        ],
      },
      9,
    )

    expect(result.supported).toBe(false)
    if (!result.supported) expect(result.downloadUrl).toBe('https://cdn.example/new.apk')
  })

  it('blocks with no link at all rather than not blocking, when the manifest offers none', () => {
    const result = evaluateManifest({ min_version_code: 10, versions: [] }, 9)

    expect(result.supported).toBe(false)
    if (!result.supported) expect(result.downloadUrl).toBeNull()
  })
})

describe('fetchMinimumVersion', () => {
  const blocking = {
    latest: '1.0.0',
    min_version_code: 10,
    versions: [{ version: '1.0.0', version_code: 10, apk_url: 'https://cdn.example/1.0.0.apk' }],
  }

  const responding = (body: unknown) =>
    jest.fn(async () => ({ ok: true, status: 200, json: async () => body }))

  it('blocks when the fetched manifest says so', async () => {
    const result = await fetchMinimumVersion({
      url: 'https://cdn.example/manifest.json',
      versionCode: 9,
      fetchImpl: responding(blocking) as unknown as typeof fetch,
    })

    expect(result.supported).toBe(false)
  })

  it('does not block when the manifest cannot be reached', async () => {
    const result = await fetchMinimumVersion({
      url: 'https://cdn.example/manifest.json',
      versionCode: 9,
      fetchImpl: jest.fn(async () => {
        throw new TypeError('Network request failed')
      }) as unknown as typeof fetch,
    })

    expect(result.supported).toBe(true)
  })

  it('does not block on an HTTP error — a 403 is not a statement about this build', async () => {
    const result = await fetchMinimumVersion({
      url: 'https://cdn.example/manifest.json',
      versionCode: 9,
      fetchImpl: jest.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({}),
      })) as unknown as typeof fetch,
    })

    expect(result.supported).toBe(true)
  })

  it('does not block when the body is not the JSON we expected', async () => {
    const result = await fetchMinimumVersion({
      url: 'https://cdn.example/manifest.json',
      versionCode: 9,
      fetchImpl: jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token')
        },
      })) as unknown as typeof fetch,
    })

    expect(result.supported).toBe(true)
  })

  it('does not block when no URL is configured', async () => {
    const fetchImpl = jest.fn()

    const result = await fetchMinimumVersion({
      url: '',
      versionCode: 9,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(result.supported).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('gives up after the timeout instead of holding the launch open', async () => {
    jest.useFakeTimers()
    try {
      const fetchImpl = jest.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')))
          }),
      )

      const pending = fetchMinimumVersion({
        url: 'https://cdn.example/manifest.json',
        versionCode: 9,
        timeoutMs: 5000,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })

      jest.advanceTimersByTime(5000)

      await expect(pending).resolves.toEqual({ supported: true })
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('the number the app compares against the floor', () => {
  it('is the versionCode from mobile/app.json, so it travels in the JavaScript bundle', () => {
    // Same reasoning as buildIdentity.ts: expo-constants and the Android
    // versionName describe the installed SHELL, and a stale bundle inside a
    // fresh shell would compare the wrong build against the floor.
    const { APP_VERSION_CODE } = require('@/shared/config/release')

    expect(APP_VERSION_CODE).toBe(appJson.expo.android.versionCode)
  })
})
