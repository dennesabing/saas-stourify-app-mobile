/**
 * Which backend this app talks to. One rule, one place.
 *
 * **Why this file exists** (STOURIFY-232). Three separate files used to work the
 * address out for themselves, with an identical line each: the API client, the
 * sync client, and the module that builds the legal-page links. Three copies of
 * one rule is a rule nobody can count, and changing one of them tells you
 * nothing about the other two.
 *
 * **Why it no longer guesses production.** The old line read
 * `?? (__DEV__ ? loopback : production)` — as a sentence, *if nobody told me
 * where the backend is, and this is not a development build, send everything to
 * production*. The trap is that `__DEV__` does not mean "development build". It
 * means "built by the debug bundler", and it is false for a `releaseDev` APK —
 * the build our own offline tests install, deliberately pointed at a laptop —
 * exactly as it is false for a production APK. At run time the app cannot tell
 * those two apart, so no single default can be both right for production and
 * safe for `releaseDev`.
 *
 * **What answers the objection.** The guess was there for a real reason:
 * `mobile/.env` is gitignored, so it never reaches an EAS builder, and a
 * production build that had somehow lost its variable would still work. That
 * case can no longer happen quietly — `mobile/eas.json` sets the variable on
 * every build profile, and `android/app/build.gradle` refuses any variant when
 * nothing resolved (STOURIFY-231, STOURIFY-234). Both roads that produce an APK
 * already check, so the guess buys a protection that is already bought and pays
 * for it with the one failure nobody can see.
 *
 * So: a development build keeps a harmless local default, and anything else
 * refuses to start rather than picking an address for you.
 */

/**
 * The address a development build uses when nothing set one.
 *
 * `10.0.2.2` is the Android emulator's alias for the host machine's loopback —
 * it is this laptop and nowhere else, and it resolves to nothing at all on a
 * real phone. That is what makes it safe as a default: the worst it can do is
 * fail to connect.
 */
export const DEV_FALLBACK_API_URL = 'http://10.0.2.2:8000/api/v1'

/**
 * Work out the backend address, or refuse.
 *
 * Both inputs are parameters rather than globals read inside so the
 * release-build case can be exercised by a test without building a release APK.
 *
 * @param value the value of `EXPO_PUBLIC_API_URL`; blank counts as absent,
 *   because `EXPO_PUBLIC_API_URL=` in a `.env` file is somebody forgetting to
 *   fill it in, not somebody asking for an empty address.
 * @param isDevelopmentBuild `__DEV__` — true only when the debug bundler built
 *   this JavaScript.
 * @throws when there is no address and this is not a development build.
 */
export function resolveApiUrl(
  value: string | undefined = process.env.EXPO_PUBLIC_API_URL,
  isDevelopmentBuild: boolean = __DEV__,
): string {
  if (value) return value

  if (isDevelopmentBuild) return DEV_FALLBACK_API_URL

  throw new Error(
    'No backend address: EXPO_PUBLIC_API_URL is not set, and this is not a development build. ' +
      'This build refuses to start rather than guess which server to send your data to. ' +
      'Set EXPO_PUBLIC_API_URL — in mobile/.env for a local build (start from mobile/.env.example), ' +
      'or on the build profile in mobile/eas.json — and build again.',
  )
}

/**
 * The address every part of the app uses. Resolved once, when this module is
 * first loaded, which for a release-family build with nothing set means the app
 * stops here instead of reaching a backend nobody chose.
 */
export const API_URL = resolveApiUrl()
