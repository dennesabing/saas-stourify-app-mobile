# Building a dev release APK (`releaseDev`)

**For:** anyone who needs a build of the Android app that starts with no network *and* can still
talk to the development backend on their own machine. It tells you which build to make, the one
command that makes it, and the one command a reviewer runs to confirm the build that goes to Play
has not been loosened along the way.

## Why this build exists

Think of the app as a shop with a delivery entrance. A **development** build props that entrance
open for plain, unencrypted deliveries, because that is convenient while you are working. A
**release** build bolts it shut — and it should, because a shipped app has no business sending its
users' data over an unencrypted connection. Android has enforced that default for every app
targeting API 28 or later.

The awkward part is that the only backend this project's test rig is allowed to drive is
unencrypted: a plain `php artisan serve` on the developer's own machine, which the emulator reaches
at `http://10.0.2.2:8000/api/v1`. The reasoning is in
[`docs/testing/which-backend-the-app-is-tested-against.md`](../../docs/testing/which-backend-the-app-is-tested-against.md).

So we had a shop with a bolted door standing next to the only warehouse it was permitted to use.
Every request from a release build failed instantly — it could not even sign in. But a release build
is exactly what offline testing needs, because only a release build carries its JavaScript inside
the APK and can therefore start with no network at all.

`releaseDev` is the way out: a build that is a release build in every respect **except** that it is
allowed to talk plain HTTP. It is built deliberately, by hand, and it is never published anywhere.

## Build it

From the repository root, on Windows PowerShell:

```powershell
.\scripts\mobile-apk-builder.ps1 -ReleaseDev
```

The APK lands at:

```
mobile\android\app\build\outputs\apk\releaseDev\app-releaseDev.apk
```

Three things to expect:

- **It takes about as long as a real release build** — roughly nine minutes cold on the machine this
  was measured on, because Gradle compiles this variant's native code separately.
- **It never publishes.** `-ReleaseDev` forces build-only mode and there is no code path from it to
  the upload step. That is deliberate: an APK that permits unencrypted traffic must not reach a
  download channel where somebody could install it thinking it was the real app.
- **Do not call `gradlew` yourself from `D:\`.** The C++ code-generation step runs into Windows'
  260-character path limit. The script's own header explains the budget and what to do if it is ever
  exceeded again.

Then install it and point the app at your backend:

```bash
adb install -r mobile/android/app/build/outputs/apk/releaseDev/app-releaseDev.apk
cd saas-boilerplate && php artisan serve --host=0.0.0.0 --port=8000
```

The API address is baked into the APK at build time from `mobile/.env` →
`EXPO_PUBLIC_API_URL`. Set that file before you build, not after.

## When to reach for it

Use `releaseDev` when you need **both** of these at once:

- the app must start with no network, which means the JavaScript has to be inside the APK; and
- the app must reach a plain-HTTP development server.

That is the combination offline testing needs — cold-starting a queue of unsent work, for instance.
For everyday development, keep using the ordinary debug build and Metro; you get fast refresh, and
you lose nothing.

## What a reviewer checks: the shipped build is still locked down

The whole point of a separate build type is that the artifact bound for Play is untouched. That is
a claim, and a claim about security is worth nothing unless somebody measures it. Read the
**merged** manifest — the file Android actually assembles from every source set — for each variant:

```bash
cd mobile/android && ./gradlew processReleaseManifest processReleaseDevManifest --no-daemon -q
for v in release releaseDev; do
  echo -n "$v: "
  grep -o 'usesCleartextTraffic="[a-z]*"' \
    app/build/intermediates/merged_manifests/$v/process*Manifest/AndroidManifest.xml | wc -l
done
```

The Play-bound `release` manifest must print `0`. The `releaseDev` manifest must print `1`. If the
first one ever prints anything but `0`, the shipped app has been loosened and the change that did it
should not land. Check `networkSecurityConfig` the same way and for the same reason — it is the
other attribute that can reopen the door, by naming a file that lists hosts allowed to use plain
HTTP.

Measured on this branch, 2026-08-19: `release` 0, `releaseDev` 1, both at `targetSdkVersion="36"`.

Two smaller guards sit underneath that:

- `mobile/__tests__/android/cleartextTraffic.test.ts` fails if anybody moves the opening onto the
  main manifest, which would put it in every build including Play's. Run it with
  `cd mobile && npm test -- __tests__/android/cleartextTraffic.test.ts`.
- `mobile/android/app/src/releaseDev/AndroidManifest.xml` is the only file that carries the opening,
  and Gradle merges a source set only into the build type it is named for. `assembleRelease` never
  reads it.

## How it is put together

| Piece | Where | What it does |
|---|---|---|
| The build type | `mobile/android/app/build.gradle` | `releaseDev { initWith release; matchingFallbacks = ['release'] }` — copies everything that makes a release build a release build, then changes nothing else |
| The opening | `mobile/android/app/src/releaseDev/AndroidManifest.xml` | `android:usesCleartextTraffic="true"`, exactly as `src/debug/` already does |
| The build command | `scripts/mobile-apk-builder.ps1 -ReleaseDev` | picks the variant's Gradle task, output path and bundle cache, and refuses to publish |

`matchingFallbacks` is not decoration. Every Expo and React Native library module publishes only
`debug` and `release` variants, so without that line Gradle cannot resolve a single dependency for a
third build type and the build dies during configuration, before it compiles anything.

The **package name does not change** — `releaseDev` installs as `com.zivsluck.stourify`, the same as
every other build, so it replaces whatever build is already on the device. That was chosen over
giving it a suffix because three separate things key off the package name: the Google Maps API key
restriction, the package name every `adb` command in an automated run is sent to, and the installed
app's own identity. Nothing here needs two builds installed side by side.
