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

## The build refuses to point this APK at production

This is the one failure worth knowing about before you hit it, because the fix people reach for
first is the wrong one.

A `releaseDev` APK carries its JavaScript inside it, so the backend address is *compiled in*. Once
the file exists, that address is a fact about the file rather than a setting anyone can change. And
the address does not only come from `mobile/.env`: Expo reads several `.env` files for a
release-family build, and it reads **`mobile/.env.production.local` above plain `.env`**. That file
is gitignored, so it shows up in no diff and no test can assert its contents.

On 2026-08-28 that produced a test APK pointing at the production backend, and two sign-in attempts
reached it before anybody noticed (STOURIFY-231). Nothing errored — every request was answered, by
the wrong server. That is the shape of this failure and the reason it needs a guard rather than
care.

So the Gradle build now **fails** rather than producing such a file. It stops for three things:

- **nothing set at all** — the app's own fallback for a non-development build is the production
  address, so an unset variable is not a neutral state (STOURIFY-232);
- **an address belonging to a tier `app.json` declares as non-development**;
- **an address that disagrees with `mobile/.env`** — compared by scheme, host and port, so a
  trailing slash is fine and a different port is not.

The message names the file or environment variable the value came from. **If it names
`.env.production.local`, do not delete that file** — production builds need it. Build with
`.\scripts\mobile-apk-builder.ps1 -ReleaseDev`, which hides it for the length of the build and puts
it straight back.

This lives in the build on purpose. It used to live only in the PowerShell script above, which
protected whoever typed that command and nobody else — and an automated runner naturally calls
`gradlew` directly. `mobile/__tests__/android/apiUrlGuard.test.ts` is what stops it moving back out.

### The production build is guarded too, and its guard points the other way

**`./gradlew assembleRelease` is not refused by any of the three rules above.** A production APK is
*supposed* to carry the production address, and the `releaseDev` guard has nothing to say about it.

It has a guard of its own instead, with the comparison inverted (STOURIFY-235). Where the dev guard
asks *is this address forbidden?*, the production one asks *is this address the right one?* — the
build refuses unless what it is about to compile in is the address `app.json` declares for the
production tier, and then it opens the finished APK to check that is what really went in.

That fills a hole the dev guard could not see, and the reason is worth a sentence. "Forbidden" is a
list of tiers, and nobody declares a laptop on their home network as a tier — so
`./gradlew assembleRelease` would happily bake `http://192.168.68.232:8000/api/v1` into a public
APK, and every request from that app would then fail for every user, with nothing at build time
saying a word.

#### You sometimes have to say which tier a `release` build is for

The variant does not tell you, because **two different, legitimate builds use `release`**:

| Command | Tier | Address it must carry |
|---|---|---|
| `.\scripts\mobile-apk-builder.ps1 -Target production -ConfirmVersion <v>` | production | the production backend |
| `.\scripts\mobile-apk-builder.ps1 -Target dev -BuildOnly` | dev | whatever `mobile/.env` declares |

The second hides `.env.production.local` for the length of the build so the local address wins. So
the build cannot work the tier out for itself, and the caller says which:

```bash
cd mobile/android && ./gradlew assembleRelease                            # production (the default)
cd mobile/android && ./gradlew assembleRelease -PstourifyReleaseTier=dev  # the local rig
```

**Silence means production**, and that default is the whole point: the build this guard exists for
is the one nobody was thinking about — an automated runner, or a stray `./gradlew assembleRelease` —
and that is the one that now refuses. With `-PstourifyReleaseTier=dev` the build is held to the
same three rules a `releaseDev` build gets, rather than to none at all.
`scripts\mobile-apk-builder.ps1` passes the flag for you on both of its dev paths, so if you build
through it you will never type it.

#### A refusal you will hit if you build both variants by hand

Gradle does not treat `.env` files as task inputs, so changing the address does **not** invalidate
the cached JavaScript bundle. Build the dev channel and then type `./gradlew assembleRelease`, and
the bundling task is up to date — the input check reads the production `.env` and is happy, and the
APK that comes out still carries the previous address. The artifact check catches it at the end:

```
REFUSING app-release.apk: it does not carry the "production" backend.
    expected     : https://api.stourify.com
    found inside : http://192.168.68.232:8000/api/v1, http://10.0.2.2:8000/api/v1
```

That is the guard working, not failing, and it is the clearest demonstration of why the input check
is not enough on its own: it was a correct prediction about a task that never ran.

Clear the cache and build again:

```bash
rm -rf mobile/android/app/build/generated/assets/createBundleReleaseJsAndAssets \
       mobile/node_modules/.cache/metro
cd mobile/android && ./gradlew assembleRelease --no-daemon
```

`scripts\mobile-apk-builder.ps1` deletes both on every run, so a build through the wrapper never
meets this.

#### The task-name trap, once bitten

For a few hours the sentence at the top of this section was false. The first version of the dev
guard decided whether to refuse by asking "is the task called `preReleaseDevBuild` running?", which
reads like a precise question about this variant and is not one: Gradle runs that task during an
ordinary production build too, so the production release refused itself and no APK could be built
at all (STOURIFY-234).

The reason is worth knowing if you ever add a build type here. Android's C++ compilation tasks are
named after the **CMake** build type — `configureCMakeRelWithDebInfo` — not after the Android
variant. `release` and `releaseDev` both compile native code as `RelWithDebInfo`, so they *share*
one set of those tasks, and a shared task has to wait for the setup step of every variant that uses
it. That is what pulls `releaseDev`'s setup step into the production build. You can see the whole
thing for yourself in about half a minute:

```bash
cd mobile/android && ./gradlew assembleRelease --dry-run   # lists every task, runs none of them
```

`:app:preReleaseDevBuild` is still in that list today. The guard simply no longer reads it as a
signal: it asks the task graph whether a `releaseDev` artifact is actually going to be produced, and
the refusal that really matters sits on the task that compiles the address in.

The contamination runs **one way only**, which was measured rather than assumed: the same dry run
against `assembleReleaseDev` lists 67 `:app:` tasks and not one non-`Dev` release task among them,
not even `preReleaseBuild`. So the production guard's anchors can be the obvious four.

### Reading the address out of a finished APK

The build checks its own output, but you can ask any APK the same question — one somebody sent you,
or one built before this guard existed:

```bash
bash scripts/check-apk-api-url.sh mobile/android/app/build/outputs/apk/releaseDev/app-releaseDev.apk
```

Exit `0` means it carries the backend `mobile/.env` declares. Exit `1` means it carries something it
must not, or is missing the one it should. Exit `2` means there was nothing inside to measure, which
is not the same as a pass. **Run it before `adb install`** — a live run that installs first and asks
afterwards has already sent its first request somewhere.

That is one question — *is this a safe test build?* — and a production APK is correctly not one, so
it exits `1` on a perfectly good production artifact. To ask the opposite question, name the tier:

```bash
bash scripts/check-apk-api-url.sh --expect production \
  mobile/android/app/build/outputs/apk/release/app-release.apk
```

Now `0` means the APK carries the backend `app.json` declares for that tier and nothing belonging to
another declared tier, and `1` means it does not. A tier name `app.json` has never heard of is a
usage error rather than a quiet pass.

One thing you will see and should not read as a fault: **a production bundle also contains
`http://10.0.2.2:8000/api/v1`.** That is a constant in the app's own source
(`src/shared/config/apiUrl.ts`), the address a development build falls back to, and it travels
inside every bundle whatever the build resolved. Neither check refuses an address it merely does not
recognise — a rule that did would fire on the next third-party library and get switched off.

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
cd mobile/android && EXPO_PUBLIC_API_URL="$(sed -n 's/^EXPO_PUBLIC_API_URL=//p' ../.env)" \
  ./gradlew processReleaseManifest processReleaseDevManifest --no-daemon -q -PstourifyReleaseTier=dev
for v in release releaseDev; do
  echo -n "$v: "
  grep -o 'usesCleartextTraffic="[a-z]*"' \
    app/build/intermediates/merged_manifests/$v/process*Manifest/AndroidManifest.xml | wc -l
done
```

**Why that command carries two extra pieces.** Asking for both variants' manifests puts *both*
bundling tasks in the task graph — `./gradlew processReleaseManifest --dry-run` lists
`:app:createBundleReleaseJsAndAssets` — so both address guards apply, and each wants a different
address. Naming the dev tier and handing it `mobile/.env`'s own value satisfies both at once.
Without them the command stops on a refusal about backends, which has nothing to do with the
manifest question you came to ask. Nothing is published or installed either way.

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
