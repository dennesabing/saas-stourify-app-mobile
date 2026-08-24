import appJson from '../../../app.json'

/**
 * Who this build actually is, as a value that lives in the JavaScript bundle.
 *
 * ## Why this file exists at all
 *
 * Think of a tin of paint. The crate it arrived in is one thing; the label
 * printed on the tin is another. Reuse a crate and its writing lies about what
 * is inside — which is why the project's mobile testing rule says to read the
 * label on the tin (`.claude/docs/testing.md` → *Client identity*).
 *
 * The crate here is the installed Android package. The tin is the JavaScript
 * this app is running, and the two genuinely come apart: a debug build fetches
 * its JavaScript from a bundler over the network, and a release build carries a
 * copy inside it. Either can be stale, and on this machine one has come from a
 * DIFFERENT PROJECT — a React Native app remembers the last bundler address it
 * was pointed at, and several projects run bundlers here at once. Every other
 * guard passed while that was happening. None of them looked at what rendered.
 *
 * So everything below is deliberately plain JavaScript that the bundler compiles
 * in. Nothing here may read `expo-constants`, `expo-application` or any other
 * native package metadata — those describe the crate, and reporting them would
 * rebuild the exact false pass this file exists to prevent. A test in
 * `__tests__/shared/buildIdentity.test.ts` pins that.
 */

/** Product name, as `mobile/app.json` spells it. Distinguishes app from app. */
export const APP_NAME: string = appJson.expo.name

/**
 * The released version, read straight out of `mobile/app.json`.
 *
 * Imported rather than regenerated on purpose: `app.json` is already the one
 * place this number lives, and a second copy could disagree with it — a
 * pointless risk for a value whose entire job is to be trustworthy.
 */
export const APP_VERSION: string = appJson.expo.version

/**
 * The short git commit this bundle was built from, or `local`.
 *
 * A file committed to git cannot contain the id of the commit that contains it
 * — the id does not exist until after the file is written. So the value is
 * stamped in as the bundle is built: `metro.config.js` reads it from git and
 * publishes it as `EXPO_PUBLIC_BUILD_COMMIT`, which Expo inlines here at bundle
 * time.
 *
 * When nothing stamped it, this says `local`, which is a true statement about a
 * bundle built from somebody's working tree — better than a blank that reads as
 * a bug. Version alone is not enough on its own: two builds of two different
 * projects can both honestly say `0.3.0`, and that collision is the failure this
 * whole file is about.
 */
export const BUILD_COMMIT: string = process.env.EXPO_PUBLIC_BUILD_COMMIT?.trim() || 'local'

/** The single line the app renders, e.g. `Stourify 0.3.0 · a1b2c3d`. */
export const BUILD_IDENTITY = `${APP_NAME} ${APP_VERSION} · ${BUILD_COMMIT}`
