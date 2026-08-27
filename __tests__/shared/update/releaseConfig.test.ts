/**
 * Where the app looks for the floor.
 *
 * This is the whole design of the card in one value, so it is pinned rather
 * than left to a comment: the address must not be served by the backend. The
 * incident that produced this feature was a backend that had moved, and a
 * warning delivered over the broken channel is a warning nobody receives.
 */
describe('release manifest configuration', () => {
  const ORIGINAL = process.env.EXPO_PUBLIC_RELEASE_MANIFEST_URL

  const load = () => {
    let mod: typeof import('@/shared/config/release')
    jest.isolateModules(() => {
      mod = require('@/shared/config/release')
    })
    return mod!
  }

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_RELEASE_MANIFEST_URL
    else process.env.EXPO_PUBLIC_RELEASE_MANIFEST_URL = ORIGINAL
  })

  it('has a working address even when the build sets nothing', () => {
    // A build that forgets to configure this is exactly the build that gets
    // stranded, so the default has to be the real one rather than blank.
    delete process.env.EXPO_PUBLIC_RELEASE_MANIFEST_URL

    expect(load().RELEASE_MANIFEST_URL).toMatch(/^https:\/\/\S+\/manifest\.json$/)
  })

  it('points at the CDN and not at any Stourify server', () => {
    delete process.env.EXPO_PUBLIC_RELEASE_MANIFEST_URL

    expect(load().RELEASE_MANIFEST_URL).not.toMatch(/stourify\.com|zivsluck\.com/)
    expect(load().RELEASE_MANIFEST_URL).toContain('digitaloceanspaces.com')
  })

  it('never derives the address from the API URL', () => {
    // Deriving it is the tempting shortcut and it silently rebuilds the bug:
    // the derived address dies at the same moment the API host does.
    delete process.env.EXPO_PUBLIC_RELEASE_MANIFEST_URL
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test/api/v1'

    expect(load().RELEASE_MANIFEST_URL).not.toContain('api.example.test')
  })

  it('lets a build name a different manifest', () => {
    process.env.EXPO_PUBLIC_RELEASE_MANIFEST_URL = 'http://10.0.2.2:8099/manifest.json'

    expect(load().RELEASE_MANIFEST_URL).toBe('http://10.0.2.2:8099/manifest.json')
  })

  it('treats a blank setting as "do not check" rather than as the default', () => {
    // The escape hatch for a build that must never be gated. It has to be a
    // deliberate empty string, which a forgetful build cannot produce.
    process.env.EXPO_PUBLIC_RELEASE_MANIFEST_URL = '   '

    expect(load().RELEASE_MANIFEST_URL).toBe('')
  })
})
