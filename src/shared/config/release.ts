import appJson from '../../../app.json'

/**
 * Where the app goes to find out whether it is still allowed to run, and which
 * build it is when it asks.
 *
 * ## Why this address is deliberately not a Stourify server
 *
 * On 25 August 2026 the backend moved house — from `stourify.zivsluck.com` to
 * `api.stourify.com` — and the old address was switched off. Every copy of the
 * app already on a phone had the old address baked into it, so every request it
 * made failed. Nothing told anybody why. The app looked broken rather than out
 * of date (STOURIFY-190, and STOURIFY-188 for the move itself).
 *
 * The obvious fix is to have the server say "you are too old" on a response the
 * app already fetches. It is cheap, and it is the wrong answer here: it is
 * posting a change-of-address note through the letterbox of the shop that has
 * closed. The app could not reach the server at all, which is the entire case
 * this check exists for.
 *
 * So the address below belongs to the storage CDN that hosts the published
 * builds. It is the same `manifest.json` the download page renders from, it is
 * public, it is static, and it is served by DigitalOcean rather than by
 * anything this project operates. The backend can be gone entirely and this
 * file still answers.
 *
 * It is a compiled-in address, so in principle it can go stale the same way the
 * API host did. That is a real weakness and worth stating rather than glossing:
 * the trade is one baked-in address for two independent ones, and both have to
 * fail before a person is left in silence again.
 */

/** The default: the production release channel's manifest, on the CDN. */
const PRODUCTION_MANIFEST_URL =
  'https://soxmanokerp.sgp1.cdn.digitaloceanspaces.com/production/stourify/mobile/apk/manifest.json'

/**
 * The manifest this build checks itself against.
 *
 * Defaults to the production one on purpose. A build that configures nothing is
 * precisely the build that ends up stranded, so "unset" has to mean protected
 * rather than unprotected. Setting `EXPO_PUBLIC_RELEASE_MANIFEST_URL` to a blank
 * value is the deliberate opt-out — an empty string is something a build has to
 * mean, not something it can forget.
 */
export const RELEASE_MANIFEST_URL: string =
  process.env.EXPO_PUBLIC_RELEASE_MANIFEST_URL === undefined
    ? PRODUCTION_MANIFEST_URL
    : process.env.EXPO_PUBLIC_RELEASE_MANIFEST_URL.trim()

/**
 * This build's Android version code — the number the manifest's floor is
 * compared against.
 *
 * Read from `mobile/app.json` rather than from `expo-constants` or
 * `expo-application`, for the same reason `buildIdentity.ts` does it: those
 * describe the installed Android package, and a stale JavaScript bundle inside
 * a fresh package would then compare the wrong build against the floor. This
 * value travels inside the bundle, so it describes the code that is actually
 * running.
 */
export const APP_VERSION_CODE: number = appJson.expo.android.versionCode

/** How long the launch check waits before giving up and letting the app run. */
export const RELEASE_MANIFEST_TIMEOUT_MS = 6000
