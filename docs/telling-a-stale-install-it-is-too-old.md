# Telling a stale install it is too old

**For:** anyone releasing the Android app, or investigating why a copy of it is showing a blocking
"this version is out of date" screen. It explains where that screen gets its answer, how to switch
it on for a release channel, and how to check it without stranding anybody.

## The problem it solves

On 25 August 2026 the backend moved from `stourify.zivsluck.com` to `api.stourify.com`, and the old
address was switched off. Every copy of the app already on somebody's phone had the old address
compiled into it, so every request it made failed — sign-in, feed, spots, uploads, all of it. And
nothing told anybody why. The app looked broken rather than out of date, and the only way back was
to guess that a newer version existed and go and find it.

That is a shop that moves premises and leaves no note on the old door. This is the note.

## Where the answer comes from, and why it is not the backend

The obvious place to put "you are too old" is a field on a response the app already fetches from the
backend. It is cheap, and here it is useless: the app in this incident could not reach the backend
at all. A warning sent down the broken channel is a warning nobody receives.

So the app asks a completely different machine. Every published build is listed in a `manifest.json`
that lives on the storage CDN, next to the APKs themselves — the same file the `/download-app` page
renders from:

```
https://soxmanokerp.sgp1.cdn.digitaloceanspaces.com/production/stourify/mobile/apk/manifest.json
```

Nothing about that address involves a Stourify server. The backend can be gone entirely and it still
answers.

Two fields in that file drive the screen:

| Field | Means |
|---|---|
| `min_version_code` | The oldest build code this channel still permits. Absent or `0` means nothing is forced. |
| `update_message` | What to tell somebody below the line. Absent means the app uses its own wording. |

At launch the app fetches the file and compares `min_version_code` against its own version code —
the number in `mobile/app.json` → `expo.android.versionCode`, which travels inside the JavaScript
bundle and therefore describes the code that is actually running rather than the Android package
wrapped around it. Below the line, the whole interface is replaced by a screen naming the problem
and offering the download link that the manifest itself carries. There is no way past it, because
everything past it is the silent dead app this exists to replace.

## The three rules that decide when it fires

- **Silence never blocks.** A file that cannot be reached, times out, answers `403`, or comes back
  as something other than the JSON we expected all mean *carry on as normal*. A gate that fired on
  doubt would turn a bad minute at the CDN into an outage on every phone at once, and it would fire
  for anyone who opened the app with no signal.
- **Development builds are never checked.** A build on somebody's laptop is deliberately older than
  whatever is published. `__DEV__` is false for the whole release family — including `releaseDev` —
  so the gate can still be exercised on an emulator.
- **The download link comes from the manifest.** The manifest carries a CDN address for each build.
  Sending a stranded person to a page on the host they cannot reach would be the original mistake
  repeated one level down.

## Drawing the line

The floor is a property of the release *channel*, not of any build, because it is decided after
those builds shipped. A build compiled in June cannot know that August's change makes it unsafe;
only whoever discovers that knows, and by then June's build is on people's phones.

Today it is set as part of a publish:

```bash
php artisan files:upload <apk> --type=apk --manifest \
  --app-version=<V> --version-code=<N> \
  --min-version-code=<N> \
  --update-message="Stourify moved to a new address. Please install the latest version."
```

**Silence leaves the floor exactly as it was.** A publish that says nothing about
`--min-version-code` does not clear it — only an explicit `--min-version-code=0` does. That
asymmetry is deliberate: a floor is set once, by whoever discovered older builds are unsafe, and
every release after that is cut by somebody who may know nothing about it.

Needing a full APK upload just to change one integer is clumsy, and
`STOURIFY-219 — Raising the forced-update floor should not require re-uploading an APK` covers
fixing that.

**Raising the floor strands every install below it, on purpose and immediately.** There is no going
back for anyone who has already seen the screen except installing a new build by hand. Set it when
older builds genuinely cannot work — a retired host, a broken sync contract — and not as a nudge to
upgrade.

## Checking it without stranding anybody

Point a build at a manifest you control rather than the production one. `mobile/.env`:

```
EXPO_PUBLIC_RELEASE_MANIFEST_URL=http://10.0.2.2:8099/manifest.json
```

Serve a file with a floor above this build's version code from that port, build `releaseDev` (see
[`building-a-dev-release-apk.md`](building-a-dev-release-apk.md)), install it, and launch. The
screen appears. Lower the floor in the served file and relaunch, and it does not.

Because the setting is compiled in at bundle time, changing it needs a rebuild — it is not something
you can flip on an installed APK.

Setting the variable to a blank value switches the check off entirely. Leaving it *unset* does not:
an unset variable falls back to the production manifest, because a build that configures nothing is
exactly the build that gets stranded, so "unset" has to mean protected.

## Where the code is

| File | Does |
|---|---|
| `src/shared/config/release.ts` | The manifest address and this build's version code. |
| `src/shared/update/minimumVersion.ts` | Fetches the manifest and decides. Never throws, never blocks on doubt. |
| `src/shared/update/useMinimumVersion.ts` | Runs the check once at launch. |
| `src/shared/update/UpdateRequiredScreen.tsx` | The screen. |
| `App.tsx` | Renders that screen instead of the navigator. |

The backend end of the same wire — the publish command that writes the two fields, and
`GET /download-app/latest.json` which serves them to anything that *can* still reach the backend —
lives in `saas-boilerplate`.
