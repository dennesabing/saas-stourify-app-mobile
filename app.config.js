/**
 * Dynamic Expo config.
 *
 * `app.json` stays the source of truth for everything static. Expo reads it first and hands
 * the resolved `expo` object to this function as `config`; whatever we return is the final
 * config. So this file only ADDS what cannot live in a committed JSON file.
 *
 * Today that is exactly one thing: the Google Maps Android API key. `react-native-maps` on
 * Android is Google Maps and requires `com.google.android.geo.API_KEY` in the manifest;
 * `expo.android.config.googleMaps.apiKey` is what writes that meta-data during prebuild.
 *
 * ## Why the value below is a placeholder and not the key
 *
 * `android/` is COMMITTED in this repo, so whatever prebuild writes into
 * `android/app/src/main/AndroidManifest.xml` ends up in git. Putting the real key here would
 * therefore publish it. Instead we emit the Gradle manifest-placeholder token
 * `${GOOGLE_MAPS_API_KEY}`, which is what lands in the tracked manifest, and
 * `android/app/build.gradle` substitutes the real value at build time from the environment
 * (`.env` → `GOOGLE_MAPS_API_KEY`). The secret exists only in `mobile/.env`, which is
 * gitignored, and in the built APK.
 *
 * The variable is deliberately NOT prefixed `EXPO_PUBLIC_` — that prefix would inline it into
 * the JS bundle, and it only ever needs to reach the native manifest.
 *
 * See `docs/google-maps-api-key.md` for how to provision and restrict a key.
 */
module.exports = ({ config }) => {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    // Loud, because the silent failure is much worse than a missing file: a build with no key
    // kills the process the moment a MapView mounts (FATAL EXCEPTION: API key not found).
    console.warn(
      '[app.config.js] GOOGLE_MAPS_API_KEY is not set — the Android build will have no ' +
        'Google Maps key and every map surface will crash on mount. ' +
        'See mobile/docs/google-maps-api-key.md.'
    );
  }

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        // Literal Gradle manifest-placeholder token. Not an interpolation — see above.
        googleMaps: { apiKey: '${GOOGLE_MAPS_API_KEY}' },
      },
    },
  };
};
