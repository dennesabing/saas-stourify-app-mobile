import Constants from 'expo-constants'
import { APP_VERSION } from './buildIdentity'
import { APP_VERSION_CODE } from './release'

/**
 * Which edition of the app is installed on this phone — the line About shows,
 * "Version 0.11.0 (build 12)" (STOURIFY-291).
 *
 * ## Why this is not `buildIdentity.ts`
 *
 * The two answer different questions, and mixing them up is the mistake worth
 * avoiding. `buildIdentity.ts` is the label on the tin: which JavaScript is
 * running, stamped into the bundle, for the test rig's client-identity check.
 * This is the writing on the crate: which build a person installed, the number
 * they would read to support or compare with Android's App info. So it reads
 * the build's own config through `expo-constants` — the one thing that file is
 * forbidden to do.
 *
 * `expo-constants` rather than `expo-application`: the first is already
 * compiled into every build through `expo`; the second is a new native module
 * and would need a rebuilt APK to show one line of text.
 *
 * `Constants.expoConfig` is the app config baked in when the build was made,
 * which Expo generates from `mobile/app.json`. Android's App info reads
 * `android/app/build.gradle`. The two agree as long as a release bumps both —
 * see `docs/what-about-and-report-leave-out.md`.
 *
 * When a build carries no config at all, this falls back to the numbers the
 * bundle was compiled with, rather than rendering a blank.
 */
const config = Constants.expoConfig

export const INSTALLED_VERSION: string = config?.version ?? APP_VERSION

export const INSTALLED_BUILD: string = String(config?.android?.versionCode ?? APP_VERSION_CODE)

/** The line About renders. */
export const INSTALLED_VERSION_LINE = `Version ${INSTALLED_VERSION} (build ${INSTALLED_BUILD})`
