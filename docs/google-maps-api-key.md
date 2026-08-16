# Provisioning the Google Maps Android API key

For anyone setting up the mobile app for the first time, cutting a build, or debugging a map that
will not draw. It gets a working Google Maps key into an Android build without ever putting the key
in git.

## Why you cannot skip this

`react-native-maps` on Android is Google Maps and only Google Maps — there is no keyless fallback
provider. A build with no key does not degrade gracefully: the Maps SDK throws on its own thread and
**kills the app process** the moment a `MapView` mounts.

```
E AndroidRuntime: FATAL EXCEPTION: androidmapsapi-ula-1
E AndroidRuntime: java.lang.IllegalStateException: API key not found.
  Check that <meta-data android:name="com.google.android.geo.API_KEY" android:value="your API key"/>
  is in the <application> element of AndroidManifest.xml
```

That was STOURIFY-21, and it blocked the live gate of every map card on the board.

## Getting a key

1. Open the [Google Cloud console](https://console.cloud.google.com/) and select (or create) the
   project that owns Stourify's map usage.
2. **APIs & Services → Library → Maps SDK for Android → Enable.** This is the step people miss. A
   key from a project without the SDK enabled does not crash — it renders a **grey canvas with no
   tiles** and an authorization failure in logcat, which looks like a map bug and is much harder to
   diagnose than the crash.
3. **APIs & Services → Credentials → Create credentials → API key.**
4. Restrict it — see [Restricting the key](#restricting-the-key) below. Do this before the key is
   used anywhere but a local debug build.

## Putting it in a build

Add it to `mobile/.env`, which is gitignored:

```
GOOGLE_MAPS_API_KEY=<the key>
```

Then regenerate the native project and build:

```bash
cd mobile
npx expo prebuild -p android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

A JS reload is **not** enough. The key lands in the native manifest, so it takes a prebuild and a
native rebuild — nothing less will pick up a newly added key.

Note the variable is deliberately **not** prefixed `EXPO_PUBLIC_`. That prefix would inline the value
into the JS bundle; the key only ever needs to reach the native manifest.

## How it reaches the manifest without reaching git

`android/` is committed in this repo, so anything `expo prebuild` writes into
`android/app/src/main/AndroidManifest.xml` is a tracked file. Writing the real key there would
publish it. The plumbing therefore goes one step further than the Expo default:

| File | What it does |
|---|---|
| `mobile/app.config.js` | Sets `expo.android.config.googleMaps.apiKey` to the **literal string** `${GOOGLE_MAPS_API_KEY}` — a Gradle manifest-placeholder token, not the key. |
| `android/app/src/main/AndroidManifest.xml` | Prebuild writes `<meta-data android:name="com.google.android.geo.API_KEY" android:value="${GOOGLE_MAPS_API_KEY}"/>`. This is the tracked file, and it holds only the token. |
| `android/app/build.gradle` | `manifestPlaceholders` resolves the real value at build time and the AGP manifest merger substitutes it. |

The Gradle lookup order is: process environment (`expo run:android` and EAS both export it), then a
`-PGOOGLE_MAPS_API_KEY=…` Gradle property, then `mobile/.env` parsed directly so a bare
`./gradlew assembleDebug` still works. If none of them yield a value the build still succeeds, with
a Gradle warning — and the resulting APK will crash on any map surface.

`mobile/app.json` remains the source of truth for all static config. `app.config.js` receives it as
`config` and adds only the key; nothing else in the resolved config changes.

### Verifying a build actually got the key

```bash
grep -o 'geo.API_KEY[^/]*' \
  android/app/build/intermediates/merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml
```

The merged manifest should show the real value, and `${GOOGLE_MAPS_API_KEY}` should not appear in it.

## EAS builds

`app.json` → `deploy.mobile.buildSystem` is `eas`, and EAS builds run on Expo's infrastructure, which
never sees `mobile/.env`. **The key must be stored as an EAS secret**, not added to `eas.json` —
`eas.json` is committed, so a value placed in a profile's `env` block would be a committed key.

```bash
cd mobile
eas secret:create --scope project --name GOOGLE_MAPS_API_KEY --value <the key> --type string
```

Once the secret exists it is exported into the build environment for every profile
(`development`, `preview`, `production`), and the same Gradle lookup above finds it in
`System.getenv`. No change to `eas.json` is needed.

Until that secret exists, EAS builds produce an APK with no key — one that installs and runs fine
right up until a map mounts. Treat it as a release blocker, not a nice-to-have.

## Restricting the key

An unrestricted key is billable by anyone who extracts it from the APK, and it *is* extractable —
it ships in the manifest. Restrict it in the Cloud console under **Credentials → the key →
Application restrictions → Android apps**, adding a package name + SHA-1 pair.

| Build | Package name | SHA-1 |
|---|---|---|
| Debug | `com.zivsluck.stourify` | `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` |
| Release | `com.zivsluck.stourify` | the release/upload certificate's SHA-1 — see below |

> **The package name changed on 2026-08-16** (STOURIFY-94), from `app.stourify.mobile` to
> `com.zivsluck.stourify`. A key restriction is a package-name **and** SHA-1 pair, so the old entry
> no longer matches anything this project builds. **Until somebody updates the restriction in the
> Cloud console, every map surface fails on a build that is otherwise perfectly good.**
>
> This failure is worth recognising on sight, because nothing about it points at the key: the build
> succeeds, the app installs, the app starts, and the map is a grey canvas — or the process dies on
> mount, which is the same shape as STOURIFY-21. No compiler, linter or test catches it, because the
> restriction lives in Google's console and not in this repository. The only check is to open a map
> on a device.
>
> Adding the new pair is a change in the console, not here. Leave the old pair in place only for as
> long as somebody still runs a build predating the rename.

The debug SHA-1 above is from `android/app/debug.keystore`, which is committed and shared by every
developer. Re-derive it any time with:

```bash
keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey \
        -storepass android -keypass android
```

For EAS release builds the signing certificate is held by EAS; get its fingerprint with
`eas credentials` (Android → production → Keystore). If Play App Signing is enabled, add **both**
the upload certificate's SHA-1 and the Play-issued app signing certificate's SHA-1, or installs from
the Play Store will see an authorization failure and a grey canvas.

Also set **API restrictions → Restrict key → Maps SDK for Android** on the same screen, so a leaked
key cannot be spent against other Google APIs.

## When the map is grey instead of crashing

A crash means *no key*. A grey canvas with no tiles means the key was found and **rejected**. Check
logcat for the reason:

```bash
adb logcat -d | grep -iE "Authorization failure|Google Maps Android API|API_KEY"
```

The usual causes, in order of likelihood: Maps SDK for Android not enabled on the project; the
package name or SHA-1 in the key's restrictions does not match the build you are running; or billing
is not enabled on the Cloud project.

## Related

- `docs/testing/android-emulator-location.md` (repo root) — getting a position onto the emulator, which
  you need before `NearbyScreen` will mount a map at all.
