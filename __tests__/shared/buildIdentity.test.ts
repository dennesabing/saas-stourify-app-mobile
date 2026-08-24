import appJson from '../../app.json'

/**
 * The project's mobile live-run gate says: read the version the APP RENDERS,
 * never the version the installed Android package carries
 * (`.claude/docs/testing.md` → *Client identity*). These tests pin the half of
 * that rule that lives in code — that the value travels inside the JavaScript
 * bundle and comes from nowhere else.
 */
describe('build identity', () => {
  const load = () => {
    let mod: typeof import('@/shared/config/buildIdentity')
    jest.isolateModules(() => {
      mod = require('@/shared/config/buildIdentity')
    })
    return mod!
  }

  const ORIGINAL_COMMIT = process.env.EXPO_PUBLIC_BUILD_COMMIT

  afterEach(() => {
    if (ORIGINAL_COMMIT === undefined) delete process.env.EXPO_PUBLIC_BUILD_COMMIT
    else process.env.EXPO_PUBLIC_BUILD_COMMIT = ORIGINAL_COMMIT
  })

  it('takes the version from mobile/app.json, so re-bundling that file changes the screen', () => {
    expect(load().APP_VERSION).toBe(appJson.expo.version)
  })

  it('takes the product name from mobile/app.json', () => {
    expect(load().APP_NAME).toBe(appJson.expo.name)
  })

  it('falls back to "local" when no build stamped a commit', () => {
    delete process.env.EXPO_PUBLIC_BUILD_COMMIT
    expect(load().BUILD_COMMIT).toBe('local')
  })

  it('uses the stamped commit when a build supplied one', () => {
    process.env.EXPO_PUBLIC_BUILD_COMMIT = 'abc1234'
    expect(load().BUILD_COMMIT).toBe('abc1234')
  })

  it('treats a blank stamp as no stamp rather than rendering an empty gap', () => {
    process.env.EXPO_PUBLIC_BUILD_COMMIT = '   '
    expect(load().BUILD_COMMIT).toBe('local')
  })

  it('reads the version straight out of the bundle, never from native metadata', () => {
    // expo-constants and expo-application describe the installed PACKAGE. A
    // stale JavaScript bundle inside a fresh package would report the new
    // version while running the old code — the exact false pass this exists
    // to prevent.
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../../src/shared/config/buildIdentity.ts'),
      'utf8',
    )
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
    expect(code).not.toMatch(/expo-constants|expo-application|NativeModules|react-native/)
  })

  it('renders one line carrying all three facts', () => {
    process.env.EXPO_PUBLIC_BUILD_COMMIT = 'abc1234'
    const { BUILD_IDENTITY } = load()
    expect(BUILD_IDENTITY).toContain(appJson.expo.name)
    expect(BUILD_IDENTITY).toContain(appJson.expo.version)
    expect(BUILD_IDENTITY).toContain('abc1234')
  })
})
