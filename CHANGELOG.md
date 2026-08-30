# Changelog

All notable changes to the Stourify mobile app are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Settings → PRIVACY now has a Show location on spots switch (STOURIFY-241).** The setting
  behind it has existed since M2 and, for most of that time, was a light switch with no wire behind
  it: the value was stored, it was copied to every device, and nothing anywhere read it. Shipping the
  control then would have told somebody their location was hidden while the API kept serving their
  exact coordinates.

  The wire is now in the wall. STOURIFY-185 stopped every REST path disclosing a hidden spot's
  position, STOURIFY-187 pinned the offline sync channel with a test showing it never sent one
  person's hidden coordinates to anybody else's device, and STOURIFY-240 taught the app to draw a
  spot that has no position. So the switch can finally be fitted.

  It sits directly under **Private account** and works exactly like it — it moves the instant you
  touch it, sends one field to `PATCH /api/v1/profile` and nothing else, and slides back with its own
  message if the server refuses. Its own message, not a shared one: two switches stacked together
  cannot both point at the same sentence and still say which save failed.

  The text under the row is part of the feature rather than decoration. It says the two things
  turning it off actually costs you — that it works from now on, because a position already
  downloaded onto a phone cannot be called back, and that your spots drop out of nearby results,
  where they can no longer be found by being close to them. They still appear in Discover, in search,
  on your profile and through a direct link. A control that quietly costs you something is the same
  broken promise as one that quietly does nothing, pointed the other way.

### Changed

- **The feed now says which kind of "no" the server sent (STOURIFY-237).** A refused feed used to
  produce one sentence — *"This account isn't allowed to see this."* — whatever the reason was.
  That is a dead end: there is nothing a reader can do about a permission they do not have, so the
  message was correct for one case and quietly wrong for the other.

  Since STOURIFY-228 the server writes a `code` on the refusal saying which of two things happened,
  and the app now reads it. An account that was never added to a Stourify organization is told
  exactly that, together with the one thing worth trying — sign out and back in — and who to ask if
  it keeps happening. An account that is in an organization but not allowed to see its posts is told
  that instead. Neither mentions the network, because neither has anything to do with it.

  A refusal carrying a code the app does not recognise, or no code at all, keeps the wording it has
  always had. That fall-through is deliberate: every screen in the app shares this one function, and
  an unfamiliar answer is not a reason to start guessing.

### Fixed

- **The offline sync can no longer quietly switch a privacy setting back on (STOURIFY-243).**
  Picture posting a change-of-address form, and then a week later posting an older copy of the same
  form you had filled in and forgotten in a drawer. The post office cannot know which one you meant,
  so it files whichever arrives last and your address reverts.

  The two switches in **Settings → PRIVACY** — Private account, and Show location on spots — are
  saved straight over the network with `PATCH /api/v1/profile`, and that save never touches the copy
  of your profile the app keeps on the phone for offline use. The offline sync push, though, sent
  that phone-side copy of both switches every time it had any reason to send the profile row at all.
  So the old form could arrive after the new one: onboarding saving an interest was enough to post a
  stale copy of a switch you had just turned off, the server accepted it, and the setting turned
  itself back on with no error and no notice.

  The push no longer carries either switch. Nothing in the app edits them offline, so it was sending
  a value it could never have a fresher opinion about than the server already had. The server treats
  a missing field here as *leave this exactly as it is*, so the two settings are now changed by one
  writer only — the Settings screen — and nothing can undo it behind the user's back.

- **A spot whose contributor hid its location no longer risks a pin in the Atlantic (STOURIFY-240).**
  Since STOURIFY-185 the API leaves `latitude` and `longitude` out of a spot whose contributor turned
  off **Show location on spots** — omitted, not nulled, so that the app can tell an unavailable
  position from a real one. Nobody had told the app. `Spot` in `src/shared/api/types.ts` still
  declared both as required, which is a form insisting a box is filled in and then handing it back
  empty: TypeScript believed every spot had a position and let any screen read straight through to
  `undefined`.

  Both fields are now optional, and the compiler — not a grep — was the search for who reads them. It
  found three places, one of which nobody would have looked at: the Explore map's filter is correct at
  run time and does not narrow a type, so its pins were `number | undefined` all along.

  The rule about which spots may be drawn now lives in one place, `src/shared/map/spotPins.ts`, used
  by both map screens. A spot with no position keeps its card in the list and loses only its pin,
  because a place with no coordinate is still a place. `0, 0` is kept, being the equator and
  Greenwich (STOURIFY-65).

  On the spot detail screen, a spot with neither an address nor a coordinate used to render nothing
  at all — and nothing looks exactly like a screen that failed to load. It now says **Location not
  shown**: what happened, not why. The response carries no reason with it, and "hidden by the
  contributor" would be a guess printed as a fact on the one screen where guessing about location is
  the failure being designed out. STOURIFY-242 would have the server say which it is.

### Added

- **The production build now refuses to compile the wrong backend into a public APK
  (STOURIFY-235).** STOURIFY-231 gave the `releaseDev` build a guard inside Gradle, because
  protection that lives only in a wrapper script protects only the people who type that command. The
  production `release` build never got one: `cd android && ./gradlew assembleRelease` would happily
  bake `http://192.168.68.232:8000/api/v1` — a laptop on somebody's home network — into an APK bound
  for the public download page, and nothing at build time would say a word. Every request from that
  app would then fail, for every user. Think of a factory that x-rays every box on the export line
  and none on the domestic line, because the export line is where a problem was found once.

  The comparison is **inverted** relative to the dev guard. That one asks *is this address
  forbidden?*, which is a list of tiers — and nobody declares a home network as a tier, so it cannot
  see this. The production one asks *is this address the right one?*: the build refuses unless what
  it is about to compile in is the address `app.json` declares for the production tier, and then it
  opens the finished APK and checks that is what really went in. An unset variable is a refusal too,
  because since STOURIFY-232 the app carries no production address in its own source and would
  refuse to start — a dead app in every user's hands is worse than a failed build.

  **The variant does not say which tier a build is for, and assuming it did would have repeated
  STOURIFY-234's bug in the opposite direction.** `scripts/mobile-apk-builder.ps1 -Target dev`
  builds the same `release` variant, with `.env.production.local` hidden so the local address wins,
  and publishes it to the private dev channel. So the caller says:
  `./gradlew assembleRelease -PstourifyReleaseTier=dev` puts the build under the dev rules, and
  **silence means production**. That default is the point — the build this card exists for is the
  one nobody was thinking about, and it is the one that now refuses. The builder script passes the
  flag on both of its dev paths, so nobody building through it has to type it.

  Attached the way STOURIFY-234 settled on: `gradle.taskGraph.whenReady` for a refusal in seconds,
  keyed on four tasks only a `release` assembly puts in the graph, with the checks that make the
  answer *correct* on `createBundleReleaseJsAndAssets` and `assembleRelease`. Measured in both
  directions rather than assumed — the `assembleReleaseDev` graph carries none of those four, and no
  non-`Dev` release task at all.

  One thing worth knowing before you read a report from it: a production bundle also contains
  `http://10.0.2.2:8000/api/v1`, a constant in `src/shared/config/apiUrl.ts` that travels in every
  bundle whatever the build resolved. Neither check refuses an address it merely does not recognise,
  because a rule that did would fire on the next third-party library and get switched off.

### Changed

- **A build that was told nothing no longer guesses production (STOURIFY-232).** Three files —
  `src/shared/api/client.ts`, `src/sync/httpClient.ts` and `src/shared/config/legal.ts` — each
  worked out the backend address for themselves, with the same line: use `EXPO_PUBLIC_API_URL`, and
  if nothing set it, use the emulator loopback for a development build and **the production
  backend** for anything else. Read as a sentence: *if nobody told me where to go, drive to head
  office.* The trap is that `__DEV__` does not mean "development build" — it is false for a
  `releaseDev` APK, the build our own offline tests install, exactly as it is false for a production
  one. At run time the app cannot tell those two apart, so no single default can be right for
  production and safe for `releaseDev` at the same time.

  There is now one file that decides, `src/shared/config/apiUrl.ts`, and the three above import it.
  Its rule: use the address you were given; with none, a development build falls back to
  `http://10.0.2.2:8000/api/v1` (this laptop and nowhere else); anything else **refuses to start**,
  with a message naming the variable and where to set it. A blank value counts as no value.

  The old guess existed for a real reason — `mobile/.env` is gitignored, so it never reaches an EAS
  builder, and a production build that lost its variable would still have worked. That case can no
  longer happen quietly: `eas.json` sets the variable on every build profile, and
  `android/app/build.gradle` refuses any variant when nothing resolved (STOURIFY-231,
  STOURIFY-234). A test reads the app's own source and fails if a second copy of the rule, or the
  production address as a fallback, ever appears again.

### Fixed

- **The production APK can be built again (STOURIFY-234).** The guard added yesterday under
  STOURIFY-231 refused every production `assembleRelease`, so the 0.9.0 release could not be built
  at all. It decided whether to refuse by asking "is the task called `preReleaseDevBuild`
  running?" — which reads like a precise question about the `releaseDev` variant and is not one.
  Android's C++ compilation tasks are named after the **CMake** build type (`RelWithDebInfo`), not
  after the Android variant, so `release` and `releaseDev` share one set of them; a shared task has
  to wait for the setup step of every variant that uses it, which pulls `releaseDev`'s setup step
  into the production build's task list. A bouncer told to turn away anyone with a visitor badge,
  posted at the door everybody walks through, does not let the wrong people in — he stops
  everybody.

  The guard now asks the **task graph** whether a `releaseDev` artifact is actually going to be
  produced, keyed on tasks that only a `releaseDev` assembly ever puts there. Gradle hands that list
  over before it executes anything, so the answer arrives even faster than before.

  **Nothing about what the guard refuses has changed.** All three refusals from STOURIFY-231 —
  nothing resolved, a non-development tier, a disagreement with `mobile/.env` — are untouched, and
  the check that actually guarantees them still sits on `createBundleReleaseDevJsAndAssets`, the
  task that compiles the address in. The fast check is now an optimisation rather than the thing
  safety rests on: if its knowledge of Android's task names ever goes stale, the cost is a slower
  refusal and never a missing one.

  `mobile/__tests__/android/apiUrlGuard.test.ts` now asserts **both** directions. Covering only one
  of them is exactly how this happened.

## [0.9.0] - 2026-08-28

### Added

- **The Android build now refuses to compile the wrong backend into a `releaseDev` APK
  (STOURIFY-231).** A release-family build carries its JavaScript inside the APK, so the server
  address is baked in when the file is made — after that it is a fact about the file and not a
  setting anybody can change. Expo reads `mobile/.env.production.local` *above* plain `mobile/.env`
  for any release-family build, and `releaseDev` is one, so the file every testing document tells
  you to edit was being quietly overruled. On 2026-08-28 a test APK reached production that way and
  two sign-in attempts went there before anything noticed. Nothing errored — every request was
  answered, by the wrong server.

  `android/app/build.gradle` now resolves that value the way Expo will (the process environment
  first, then `.env.production.local`, `.env.local`, `.env.production`, `.env`) and fails the build
  on three things: nothing set at all, an address belonging to a tier the root `app.json` declares
  as non-development, or an address that disagrees with `mobile/.env`. It then opens the finished
  APK and checks what actually went in, because every other check reads an input and is therefore a
  prediction.

  "Nothing set" is a refusal because the app's own source falls back to the production address when
  the variable is unset and the build is not a development build — and a `releaseDev` build is not
  one. So an empty value is a production build wearing a dev name, not a neutral state
  (STOURIFY-232).

  It refuses rather than quietly fixing the value. All of this protection previously lived in
  `scripts/mobile-apk-builder.ps1`, so it worked for whoever typed that command and for nobody else,
  and an automated runner naturally calls `gradlew` directly. Putting it in the build means both
  commands are protected the same. `__tests__/android/apiUrlGuard.test.ts` is what stops it moving
  back out, alongside `cleartextTraffic.test.ts`, which guards the neighbouring property in the same
  file.

### Fixed

- **The feed no longer tells you your connection is broken when the server said no
  (STOURIFY-225).** On the test handset the Home tab showed "We couldn't reach Stourify just now.
  Check your connection and try again." while the sync layer, in the same app in the same seconds,
  was talking to that same server without a hitch. The feed's request had been answered too. The
  answer was `403 This action is unauthorized.`

  So the screen was sending somebody to look at their wifi over a permission problem they cannot see
  and could not have fixed. Picture ringing a shop, being told you are not a member, and reporting
  afterwards that the line was dead.

  The information was never missing. A failed request from `axios` carries a `response` when the
  server answered and carries none when it did not, and the status says which answer — the screen was
  holding both facts and never read either. `src/shared/api/errorMessage.ts` now reads them, in one
  small function, and `FeedScreen` asks it what to say. A dead network still gets the old sentence,
  because for a dead network the old sentence was right; a deadline that ran out says the server was
  slow rather than absent; a `403` says the account is not allowed and mentions the connection
  nowhere. A test pins that last absence, because a screen that stacked both sentences would pass a
  test that only checked the new one was present.

  Twelve other screens still carry the original wording and are STOURIFY-230. Two things the
  diagnosis turned up on the server side are STOURIFY-228 and STOURIFY-229.

- **The handset procedure no longer tells you to clear the setting that keeps the phone unlocked
  (STOURIFY-226).** `docs/does-the-vpn-explain-the-stuck-offline-flag.md` used to say: keep the
  screen awake with `adb shell svc power stayon usb`, "remembering to put it back with `svc power
  stayon false`". That half-sentence was the instruction that stalled a board drain.

  Clearing the flag lets the screen time out about ten minutes later. The lock screen then comes
  back, and the phone sits behind a PIN that nothing on the dev box holds — so the next card needing
  a real phone cannot start at all. It cost two skipped device cards in one drain, plus three earlier
  attempts at STOURIFY-134 that each built and unit-tested a change they could then not verify.

  The setting is `stay_on_while_plugged_in`, the operator set it to `2` on 2026-08-28, and it is
  permanent. It is not a run's setting, so there is nothing to put back — writing the value the phone
  already holds changes nothing and owes nothing. Everything else about the phone is still restored
  exactly as found: the VPN back up and confirmed, airplane mode off, nothing installed or
  uninstalled, the login and the local database untouched. The general rule is
  `.claude/docs/testing.md` → `## Teardown`, rule 6; the full per-setting list for this handset is in
  the orchestrator repo's `docs/testing/what-a-run-must-not-restore-on-the-test-handset.md`.

### Changed

- **`docs/building-a-dev-release-apk.md` says what the build now refuses and why (STOURIFY-231)**,
  including the wrong first instinct: if the message names `.env.production.local`, do not delete
  that file — production builds need it. Build through `mobile-apk-builder.ps1 -ReleaseDev`, which
  hides it for the length of the build and puts it back.

- **The reconnect protocol's first step is now taking a guard on the phone, not trusting a report
  that the last loop finished (STOURIFY-227).** `docs/does-the-vpn-explain-the-stuck-offline-flag.md`
  used to end with six `adb` lines to retype. It now sends you to `scripts/handset-round-loop.sh` in
  the orchestrator repo, and it opens by saying why: on 2026-08-28 a harness reported the round loop
  had stopped, it had not, and for nine minutes two loops toggled one handset's radio underneath each
  other's rounds. Seven rounds were discarded. Waiting longer before starting the second loop would
  not have helped — the report was wrong, not late — so the answer is to ask the machine instead.

  The section also explains what a `SUSPECT` round is and why it is counted neither clean nor stuck,
  and which of the two checks that produce one is load-bearing: a round made of `sleep` calls cannot
  be shortened by another loop, so the wall-clock floor never catches a second driver. The check that
  the phone's airplane setting is what the loop last left it as does, in the round it happens.

- **Sixty reconnects on the handset, sixty of them clean — the stuck-sync fault did not appear
  (STOURIFY-221).** With the sync trace on, sixty airplane-mode reconnects on the physical Samsung
  all ended with a `sync/delta` request reaching the backend inside the sixty-second watch: the
  connectivity edge fired sixty times out of sixty, a cycle started within a millisecond of it every
  time, no cycle was ever turned away holding the latch, and every cycle that started also finished.

  **This is a failure to reproduce, not progress.** Nothing in the app changed, nothing about the
  bug is understood, and no repair was designed. What it buys is one number: four stuck rounds in
  123 across every session on this handset, about one in thirty rather than the one in fifteen
  everybody had been planning against — which means running the same protocol again is a coin toss
  and the next attempt should change the protocol instead. The full record, including two limits of
  the measurement that bound what any number of clean rounds could prove, is
  `docs/sixty-reconnect-rounds-with-the-trace-on.md`.

- **A sign-out now writes down why it happened, before it destroys the evidence (STOURIFY-214).**
  The app can end its own session: a `401` from either HTTP client runs `signOut()`, which clears
  the token, drops the sync cursor, wipes every local row and returns to the login screen. On a real
  handset that was seen happening with nobody touching the phone — two airplane-mode cycles and the
  app was on `Welcome back` — and afterwards there was nothing at all to read, because the database
  that might have held a clue was the thing that had just been erased.

  `src/sync/signOutRecord.ts` writes one line at the moment of the decision, naming what triggered
  it (a user logout, a closed account, or a rejection from one of the two clients), the status code,
  the method and path of the request, whether a credential was actually sent, and how many unsent
  rows and unsent photos were about to be destroyed. Read it with `adb logcat | grep S214`.

  Two details that are deliberate rather than incidental. It is written **first**, before the
  teardown, because the queue depth it reports is reset partway through — a record taken at the end
  would say zero on every sign-out, including the ones that threw a user's work away. And it is
  **always on**, unlike the `EXPO_PUBLIC_SYNC_TRACE` sync trace next door, because an instrument you
  have to arm in advance is one you do not have the one time it fires.

  `docs/what-makes-the-app-sign-itself-out.md` is the write-up: what reading the code already ruled
  out, the suspect nobody had named — a request that goes out with no credential at all, earns a
  perfectly correct `401`, and has it read as a rejected login — and how to read the new line.

  Nothing about when the app signs out changed. That is STOURIFY-224.


- **The reconnect protocol now proves its own instrument is alive before it counts a round
  (STOURIFY-223).** `docs/does-the-vpn-explain-the-stuck-offline-flag.md` judges every round by
  whether a request reached the local backend, and an empty log is what a stuck round looks like —
  so a silent log makes the whole procedure report the fault every time. Two runs on the same
  machine disagree about whether the plain server logs at all, and nothing has explained the
  difference, so the document no longer relies on either account: it starts the server through the
  request-logging script committed in the root repository, and it opens with a check that makes one
  request by hand — from this machine and once from the phone — and confirms a line appears, with an
  instruction to stop rather than record anything if it does not. No app code changed.

- **Wrote down what the handset actually does after a reconnect, and it is not what the bug report
  said (STOURIFY-134).** Twenty airplane-mode reconnects on the physical Samsung SM-S908E, ten with
  its always-on VPN up and ten with it switched off, to find out whether the tunnel was the reason
  the offline queue sometimes fails to send itself. It is not: the one round that failed was in the
  arm with the VPN switched *off*. More usefully, the diagnostic log of that round shows the app's
  online flag recovering correctly and the sync still never running — so the failure is downstream
  of the connectivity flag, not in it, which contradicts the diagnosis this bug has carried since
  it was filed. No app code changed. The full account, including the protocol to reproduce it and
  what to instrument next, is in `docs/does-the-vpn-explain-the-stuck-offline-flag.md`.

### Added

- **The app can be asked to narrate every sync cycle, so a sync that does nothing can say why
  (STOURIFY-220).** There is a long-running fault where the phone is demonstrably back on the
  network, the app's own flag agrees, and still nothing is sent — and until now all six ways a sync
  cycle can end looked identical from outside: silence. Build with `EXPO_PUBLIC_SYNC_TRACE=1` and
  the app writes one line to the phone's log for every network reading it receives, every cycle it
  starts, every step inside that cycle, and every reason a cycle ends. A cycle turned away because
  another is already running now says which one is holding it up and for how long, which is the
  measurement the leading explanation for this bug turns on. It is off in every ordinary build and
  it changes nothing the app does — no decision anywhere reads it. `docs/instrumenting-a-sync-cycle.md`
  says how to switch it on and how to read the output.

  The first run of it — twenty airplane-mode reconnects on the physical handset — did **not**
  reproduce the fault: twenty rounds, twenty clean. That is written up as the null result it is in
  `docs/what-the-sync-cycle-did-on-a-stuck-reconnect.md`, along with a healthy reconnect in full so
  the next stuck one has something to be compared against. Nothing about the bug is settled by it,
  and no repair was designed.

- **The app can now tell you it is too old to work** (STOURIFY-190).

  When the backend moved to a new address in August, every copy of the app already on a phone
  failed every request and said nothing about why. It looked broken rather than out of date, which
  is a shop that moves premises and leaves no note on the old door.

  At launch the app now reads the published release manifest — the same file the download page
  renders from, which lives on the storage CDN and has nothing to do with the backend's address.
  If that file says the oldest permitted build is newer than this one, the app replaces its whole
  interface with a screen naming the problem and offering the download link, with no way past it.
  The link comes from the manifest too, so it still works when nothing this project operates is
  reachable.

  Nothing fires unless the manifest actually says so. A file that cannot be reached, times out, or
  carries no floor at all lets the app run exactly as before — a forced-update screen caused by a
  bad minute at the CDN would be a worse outage than the one it prevents. Development builds are
  never checked. See `docs/telling-a-stale-install-it-is-too-old.md`.

### Changed

- **"Write a review" moved off the spot page and onto the reviews page** (STOURIFY-211).

  The button used to sit on a spot's page, one line under the rating you tap to read what other
  people wrote. That is the comment cards by the front door and the guest book in the back room:
  you were asked to add to a list you had not been shown.

  It is now pinned to the foot of the reviews page itself, where it stays put whether the spot has
  no reviews, a few, or more than fit on a screen. The spot page keeps the rating row as the way
  through, and has no review buttons of its own left.

- **A spot's description now sits in its own panel, so you can tell it is the spot's own words**
  (STOURIFY-213).

  On the **About** tab the description was plain text with nothing around it. Below it sit the notes
  other visitors have pinned up, and nothing on screen separated the two — so the one paragraph
  written by whoever added the spot read like a stray sentence.

  It now sits on a bordered, filled panel, the same surface the app uses elsewhere, which works in
  both the light and dark themes. A spot with no description shows no panel at all rather than an
  empty box.

## [0.8.0] - 2026-08-26

### Changed

- **Where a spot is now sits under its name, and tapping it opens your map** (STOURIFY-210).

  The address and coordinates lived inside the **About** tab — and a spot opens on **Posts**. So the
  one thing everybody wants from a place, *where is it*, was behind a tap nothing invited you to
  make. On a spot with no description that tab looked bare enough to seem broken.

  It is now under the spot's name, on screen whichever tab you are on. Tap it and your map app opens
  at that point, so you can get directions.

  A spot whose owner has hidden its location still shows roughly where it is, and is deliberately
  **not** tappable — there would be nothing to open.

## [0.7.1] - 2026-08-26

### Fixed

- **The review pages now say which spot they are about** (STOURIFY-209).

  Going from a spot to its reviews gave you a page headed **"Reviews"** and nothing else — it could
  have been the reviews of anywhere. The same was true of the form for writing one.

  Both now show the spot's name under the title, and both put **← Back** on its own line with the
  title beneath it, rather than sharing a row.

  The name costs nothing to show: the app already has it from the spot page you came from. The
  **Write a review** form deliberately never asks for it over the network — that screen is built to
  work with no signal, so it uses the name if it has one and shows nothing if it does not.

## [0.7.0] - 2026-08-26

### Added

- **A spot's photos can be swiped through on the spot page** (STOURIFY-201).

  It showed the first photo and nothing else, so a spot with five looked exactly like a spot with
  one. The only way to find out otherwise was to tap through to the full-screen gallery — something
  you do when you already believe there is more to see. Swipe the picture now, with a dot per photo
  underneath. Tapping still opens the full-screen view.

- **The photo gallery says which spot you are looking at** (STOURIFY-199).

  A full-bleed photo with nothing but a Back button on it could be of anywhere — especially if you
  arrived from a search result, or came back to the app a few minutes later. The spot's name now sits
  under the Back button, with "Photo 2 of 5" beneath it. The Back button is the same one the spot
  page uses, so the two screens can no longer drift apart.

### Fixed

- **Lists now refresh when you come back to them** (STOURIFY-200).

  Add a spot, then open "Spots near me" — a screen you had looked at earlier — and it said **"No
  spots nearby"**, while a pin for that very spot sat on the map above it.

  Nothing was broken and no request failed. The app keeps a screen you navigate away from, so coming
  back showed you the answer from the last time you opened it. Discover, Spots near me and Saved
  spots now ask again when you return to them.

## [0.6.0] - 2026-08-26

### Added

- **You can now see the spots you have saved** (STOURIFY-195).

  Tapping the heart on a spot has always worked — it saved the spot and sent it to the server
  correctly. There was simply nowhere in the app to go and look at the result, so the heart was a
  promise the app had no way of keeping. There is now a **Saved spots** button on your own profile,
  and a screen behind it listing everything you have saved. Tap any of them to open the spot.

- **A reply thread now says what it is a reply to** (STOURIFY-198).

  Opening the replies on a note about a spot used to land you on a page headed only "Comments" — the
  spot and the note you had been reading a second earlier were both gone, and nothing on the page
  named either. Coming back to the app a few minutes later, there was no way to tell what the
  conversation was about without going back twice. The thread now names the spot and quotes the note
  it hangs from.

- **The spot page is less crowded** (STOURIFY-197).

  It stacked three buttons and two tabs above anything worth reading, so arriving at a spot meant
  looking at a control panel and scrolling to reach the place itself.

  - **Save** is now a mark on the photo, where people already look for it, rather than a button in
    the column below.
  - The **rating line** takes you to the reviews, so the separate "See all reviews" button is gone —
    it repeated a link sitting directly on top of it. The review count was already on that line.
  - Notes are separated from each other by a line, so a long note and the next one no longer run
    together.

  Two rows and two controls fewer, with nothing removed that you could do before. The text is the
  same size on purpose: the page felt heavy because of how much was on it, not how big anything was,
  and this is read outdoors on a phone.

### Fixed

- **Spots you add are now actually published** (STOURIFY-202).

  This is the big one. Every spot ever created in the app was saved as an unfinished draft and
  never published — so nobody could find it. Not by searching, not on Discover, not on the map,
  not in the nearby list. **Not even the person who made it.** The app accepted the spot, uploaded
  the photos, showed it in "My spots", and reported no problem at any point.

  Finishing the create flow now publishes the spot, which is what pressing that button always
  looked like it did.

  **"My spots" now also says when a spot is not visible to anyone.** That list is where this should
  have been obvious and was not: a draft looked exactly like a live spot, so the app's own list
  gave no hint that nothing had gone out.

  If you added spots on an earlier version, they are still drafts and still invisible. They are not
  lost — say the word and they can be published.

- **Search no longer blames you when there is simply nothing to find** (STOURIFY-194).

  Searching an empty Stourify said *"No results — try a different word, or another filter"*, which
  sends you hunting for better search terms against a catalogue that was never going to answer.

  When the app can actually tell that nothing has been added yet, it now says so instead. It only
  makes that claim when it has evidence — an empty search on its own does not prove an empty
  catalogue, since "no spot matched your word" and "there are no spots" look identical. Search a
  word nothing matches on a full Stourify and you still get the ordinary "No results".

- **Your spots now show their photos in "My spots"** (STOURIFY-192).

  Every row in that list drew a grey rectangle where the picture should be, which looks like a
  broken image rather than a missing one. Two separate things were missing: the phone was never
  sent the photo in the first place, and the list never asked for one. Both are fixed, so a spot
  that has a photo now shows it.

  A spot you have just created offline still shows no picture until it has been through the server.
  Its photos are on your phone waiting to upload, which is a different thing from a photo the app
  can display, and pretending otherwise would show you a picture that vanished later.

- **Discover's category buttons now work** (STOURIFY-193).

  The row of buttons across the top of Discover — Nature, Foodie, Coast and the rest — did nothing
  at all. Pressing one changed nothing, because there was no way to ask the server for one category
  and a button that appeared to filter would have shown the same unfiltered list every time.

  They filter now. Three other things changed with them:

  - The buttons are the same categories offered when you add a spot, so what one person tags is what
    another can find. They had drifted apart: Discover offered half the list, plus one that was
    never a category at all.
  - **Trending** is gone. Nothing was ever tagged with it and there is no trending list behind it.
    **All** takes its place, which is what it actually did.
  - Choosing a category with nothing in it now says so, instead of telling you the app is empty and
    inviting you to add the very first spot.

- **The keyboard no longer covers the Note box on a spot** (STOURIFY-196).

  Tapping the box to add a note about a place opened the keyboard directly over it, so you were
  typing into something you could not see. The page now lifts the box clear of the keyboard, the same
  way the comment box and the post composer already did.

- **Terms, Privacy and account deletion now open the Stourify website** (STOURIFY-191).

  Those three links pointed at `api.stourify.com` — the address of the machine the app fetches data
  from, not the site people are meant to read. Being asked to read a legal document at an address
  that announces itself as an API server is the wrong thing to show someone at exactly the moment
  they are deciding whether to trust you. They now open `stourify.com`. The address is a setting, so
  a development build with no separate website still gets working links.

## [0.5.0] - 2026-08-25

### Changed

- **The app now talks to `api.stourify.com`** (STOURIFY-188).

  Production moved to a new hostname and the previous one was retired. Every place the app names the
  backend follows it: the API client, the offline sync client, and the privacy, terms and
  account-deletion links.

  **If you are running 0.4.0 or earlier, it cannot work.** That build has the old hostname compiled
  into it, and the old hostname no longer answers — so every request fails, including signing in. The
  app has no way to update itself, so the only fix is to install this build from the download page.
  Anything you saved offline is still on your phone and will send once you are signed in again.


### Fixed

- **Settings scrolls, so Logout and Delete account can be reached on a small phone** (STOURIFY-181).

  The screen was a menu printed on a card taller than the table it sat on. Every row existed and
  worked; the ones past the bottom of the screen simply could not be brought into view, because the
  content hung off a plain `View`, which clips rather than scrolls. On a 720x1280 phone the list
  stopped at Terms of Service, and swiping did nothing.

  The two rows stranded below the fold were the ones that matter most: **Logout** and **Delete
  account**. A user on a small phone could neither sign out nor delete their account from inside the
  app — and an in-app deletion route is a Google Play requirement, so a control that cannot be
  touched is, from the store's point of view, not there.

  The content now scrolls and the header stays put, with bottom padding so the last row clears the
  tab bar. Verified on the 720x1280 emulator: both rows reachable, fully visible, and tappable —
  Delete account opens its confirmation sheet, which still demands the account's email and password.

  Worth knowing for the next screen like this: the existing tests asserted both rows were present
  and passed for the entire life of the bug. A unit test renders into no viewport, so it finds every
  row whether or not a person could reach one. Three new cases pin the structure that makes
  scrolling possible; the device is what proves it.


## [0.4.0] - 2026-08-25

### Added

- **Opening the Sync status screen now tries to send the queue, with no tap** (STOURIFY-179).

  Somebody who opens that screen is doing what a driver does when they walk out to look at the van:
  they already suspect the parcels have not gone. Until now the screen only reported — it would show
  a stalled queue for as long as anyone stared at it, and nothing on it made the queue move.

  Opening it starts one sync cycle. Going back and straight in again starts nothing: a ten-second
  cooling-off window in `src/sync/openTrigger.ts` turns the second open away, so tapping in and out
  cannot become a burst of requests. That window is a separate guard from the one already in
  `runSyncCycle`, which only covers cycles that *overlap*; a cycle that finished in a fraction of a
  second leaves the next tap free to start another, and that is the case this catches.

  It fires on mount rather than on navigation focus. This screen is a leaf — it opens nothing on top
  of itself, so backing out of it unmounts it and the two events are the same event today. There is
  no visible "Sync now" button; that is a separate design question.

- **The app now says which build it is, at the bottom of every screen you can reach before signing
  in** (STOURIFY-73).

  One quiet line — `Stourify 0.3.0 · a1b2c3d` — on Welcome, on Login, and on Settings.

  It exists for whoever is about to trust what a test run on a phone or emulator showed them. Think
  of a rule that says to read the label printed on the tin rather than the writing on the crate it
  arrived in: sensible, because crates get reused — and useless in a factory that has never printed
  a label. The project's testing rules have said for months to read the version *the app renders*
  rather than the version the installed Android package carries, and the app rendered none, so the
  only number available was the one the rule warns you off.

  **The value travels in the JavaScript bundle, and that is the entire point.** The Android package
  and the JavaScript running inside it are two separate things that come apart: a debug build pulls
  its JavaScript from a bundler over the network, and a release build carries a copy inside. Either
  can be stale, and on this machine one has arrived from a *different project* — a React Native app
  remembers the last bundler address it was pointed at, and several projects run bundlers here at
  once. Reading `expo-constants` or the Android `versionName` instead would report the fresh package
  while the old JavaScript ran, which is exactly the false pass the check exists to catch.

  The version comes from `app.json` itself, imported rather than copied, so the two can never
  disagree. The short commit is stamped in by `metro.config.js` as the bundle is built — a file in
  git cannot contain the id of the commit that contains it — and reads `local` when nothing stamped
  it, which is a true statement about a bundle built from a working tree rather than a blank that
  looks like a bug.

  New: `src/shared/config/buildIdentity.ts`, `src/shared/components/ui/BuildIdentity.tsx`.

- **Hashtags are links, and tapping one opens that tag's page** (STOURIFY-173).

  Write `great noodles #StreetFood` and the word now reads as a link rather than as ordinary grey
  text. Tap it and you land on a page gathering the posts and spots carrying it. The links appear
  on a feed card, on a post's own screen, and in a spot's description.

  **The words are read out of the caption, not fetched from the server**, and that is the decision
  the whole thing hangs off (STOURIFY-103, decision 7). A post written with no signal is waiting in
  the send-later queue and has never been near the server, so there is no list of tags to read — but
  the caption is already in hand. `src/shared/utils/hashtags.ts` is a deliberate mirror of the
  server's parser; the server stays authoritative for what is *stored*, and this copy only decides
  what is underlined.

  Two rules a plain regular expression gets wrong, and both are pinned by tests: `#food#drink` is
  **two** tags, and `C#` is **none**. A hash glued to the end of a word starts nothing — unless what
  it is glued to was the tail of the tag before it.

  **The tag page tells five situations apart, not two.** Still loading, the tag does not exist, the
  request failed, the tag exists with nothing on it, and there is content — five different sentences.
  The pair that matters is *could not load* against *nothing here*: a reader told there is nothing
  goes and looks elsewhere, while a reader told it failed tries again, which is the one move that
  helps. That is the defect STOURIFY-85 to STOURIFY-90 are about, and it is why STOURIFY-172 built
  the lookup as its own request that can answer `404`.

### Fixed

- **Onboarding's people search no longer says "No one found" when the search never got through**
  (STOURIFY-88).

  The last step of signing up asks you to find people to follow. On a dropped request it used to
  say "No one found — Try a different name or handle", which is a claim about Stourify made by a
  screen that never found out — said to somebody three minutes into their first session, on the one
  step built to prove the app is not empty. They do not retry; they skip, and arrive believing
  nobody is here.

  There are now four sentences instead of one. Before two characters are typed, a prompt asks for a
  name rather than leaving a blank rectangle. While the request is in flight it says "Searching…". A
  failed search says "Couldn't search for people" and offers a **Try again** that re-runs it. A
  search that genuinely matched nobody keeps today's copy, word for word.

  The gate is asked first and on purpose: React Query reports a query it was never allowed to send
  as *settled*, so any other ordering makes the screen report an outcome for a search it never ran.

- **A spot's reviews no longer claim the spot has none when the request failed** (STOURIFY-85).

  A shop with the lights off looks exactly like a shop with empty shelves. The Reviews screen had
  one sign in the window — "No reviews yet — Be the first to write one." — and it hung that sign up
  whether the request was still on its way, had never got through, or had genuinely come back with
  nothing. The middle case is the damaging one, because the sentence is a claim about *the spot*
  rather than about the network: a reader who believes it may write a duplicate review, or walk away
  from a well-reviewed place thinking nobody has been.

  There are now three sentences. A first load with nothing cached shows placeholder cards. A failed
  request says "Couldn't load the reviews" and offers a **Try again** that re-runs it. A request
  that came back with nothing keeps today's copy, word for word.

  **The branch lives inside `ListEmptyComponent`**, which only renders when the list has no rows at
  all, so anything the reader can already read wins over the error message. That matters more on
  this screen than on any of its siblings: the list merges the local `sto_reviews` collection with
  the server's, so somebody who wrote a review offline is looking at their own words while the
  server fetch is failing, and a network message must not cover them. A test pins that.

- **The "✓ Verified" tag appears on a verified spot — for the first time in the app's life**
  (STOURIFY-72).

  The spot detail screen has always carried a small "✓ Verified" tag next to a spot's title, and
  it has never once been drawn. It was switched on `status === 'active'`, and `active` is not a
  value the server can send: a spot's status is one of `draft`, `published`, `under_review` or
  `removed`. The tag was wired to a light switch in a different building.

  Two things had to be wrong at once for that to survive. The `Spot` type declared
  `status: 'active' | 'pending'` — those are a *follow* request's two states, copied onto a field
  that shares nothing with it but a name — so TypeScript saw a comparison against a value its own
  type called legal and said nothing. And the field the tag was always meant to read, `is_verified`,
  which the server sends on every single spot, was not in the type at all, so no screen could have
  used it even if somebody had noticed.

  The type now names the four statuses the server actually has, declares `is_verified`, and the tag
  asks that instead. Nine test fixtures that were writing an impossible status now write a real one.
  One of them mattered more than the rest: the test asserting the tag rendered **passed**, against a
  fixture inventing the same impossible value — a green test proving a badge works on a wire shape
  that does not exist. It is now two tests that ask the honest question, one for each answer.

  **What this does not do**: make the tag appear on production. Only a moderator can verify a spot,
  and the endpoint that would let one do it has not been built — the permission is modelled, the
  route is not. On a seeded environment the tag shows up immediately; everywhere else it waits for
  that separate piece of work.

- **The `Spot` type no longer declares two fields the server has never sent** (STOURIFY-27).

  `Spot.id` was declared as a **required** field and `Spot.category` as an optional one, and
  `SpotResource::toArray()` has never put either on the wire. Think of the interface as a customs
  declaration for parcels arriving from the server: two of its lines described goods nobody had ever
  shipped. Both are gone, along with the `as Spot` casts in five test fixtures that only existed to
  satisfy them.

  Nothing read either field, so nothing changes at run time — the app ships the same JavaScript.
  What changes is that the fixtures are now *checked* against the type instead of exempted from it.
  A cast is a blanket silencer: `as Spot` suppresses every complaint about an expression, not just
  the one it was aimed at, which is precisely how `Spot.name` survived unnoticed until STOURIFY-11.
  Each cast is now a plain type annotation, so a future mismatch has somewhere to surface.

  The missing `id` is not an oversight to fix on the server. The offline sync delta is a second wire
  format for the same table and it *does* carry the integer, which the phone's database keeps in
  `server_id` — so the project had already settled which channel exposes internal keys. The public
  resource joins on `uuid`.

  `Spot.status` is a third instance of the same defect and is deliberately untouched here; it has a
  real reader and is carried by STOURIFY-72.

- **A photo waiting to upload now counts towards the Offline & sync banner** (STOURIFY-165).

  With a photo queued and nothing else, the banner said *"You're offline · Nothing waiting to
  send"* — directly above a Photos section showing that photo, waiting to be sent. A till receipt
  that leaves items off: every line on it is true, the total is wrong, and the total is the line
  people read.

  `SyncStatusScreen` pulls six lists out of one hook and renders all six as sections, but handed the
  banner only four of them. The two media lists were missing.

  Fixed, and the rule behind it is the part worth keeping: **the banner counts exactly what the
  screen lists.** This defect has now appeared twice — once the moment a post could be queued, which
  STOURIFY-161 fixed for posts alone, and once for photos, which had it all along. Fixing the
  instance rather than the class is what let it happen a second time, so every list rendered on the
  screen now contributes to the total above it.

  Note what a queued photo includes: any `pending_media` row in the `pending` state, which covers a
  photo captured into a draft that has not been published. That photo is already listed on the
  screen, so counting it is what makes the total agree with the list.

  **`useSyncStatusStore` is untouched.** `pendingCount` and `pendingMediaCount` stay separate,
  because the skip-pull gate reads the first and a photo must never make it fire. This changes only
  what the screen displays.

- **The password box that confirms deleting your account now has a Show button** (STOURIFY-164).

  STOURIFY-99 added a Show / Hide toggle to password fields by putting it inside the shared `Input`
  component, so every field built from that got it for free — Login, Register's two, Reset
  password's two. This one was hand-rolled from React Native's own `TextInput` on its own screen,
  so the shared change went straight past it. Every door in the house was fitted with the same
  handle; one door had been hung earlier from a different set of parts, and was simply not part of
  the set.

  It is also the field where seeing what you typed matters most rather than least: get it wrong and
  the server answers with a validation error that reads like a wrong password, on an action that
  cannot be undone. Note that it is **not** a change-password box — there is no change-password form
  on Settings — which is the second thing STOURIFY-99's commit message got wrong about it.

  Fixed by building both confirmation fields from the shared `Input` rather than by copying the
  toggle, so the next shared improvement does not go past this field as well.

  Two things came with that. Both fields now carry a name a screen reader can announce; previously
  the only text on either was the placeholder, which disappears the moment you type. And the two
  fields now follow the app's theme while the dialog around them does not — in dark mode they look
  as they always did, in light mode they are light on a dark card. `SettingsScreen` carries 17 more
  colour literals and no use of the theme at all; converting it is filed separately.

### Added

- **The app is prettier-formatted, and a check now enforces it** (STOURIFY-163): prettier pinned at
  `3.9.6` in `devDependencies`, `format` and `format:check` scripts, `.git-blame-ignore-revs`,
  markdown excluded in `.prettierignore`, and `docs/code-formatting.md` rewritten to record a
  decision rather than a caveat. `cd mobile && npm run format:check` joins the mobile channel's unit
  array in the root `app.json`.

  `.prettierrc` had described this code correctly since STOURIFY-162 on quotes, semicolons, trailing
  commas, arrow parentheses and JSX quotes — and **114 of the app's 247 TypeScript files still
  disagreed with it**, entirely about where lines are broken. That is the one state nobody chose: not
  a description of the code, because the code failed it, and not a rule, because `prettier --check`
  could never pass and so could never gate anything. The only defence against a repeat of the
  STOURIFY-162 accident was a page asking people not to run a formatter.

  What settled it was a measurement. Only **1.3%** of the app's 35,598 lines were longer than the
  configured width, yet prettier changed 2,377 of them — so the churn was never about long lines. It
  was prettier breaking constructs differently from the author, **in both directions**, on lines that
  already fit. There was no consistent hand-wrapping style for a tool to ruin; there were 247
  unconnected decisions, and prettier supplies the first actual rule rather than overriding one.

### Changed

- **122 files reformatted** (STOURIFY-163), in one commit containing nothing else. Behaviour is
  untouched, and that is a property of the tool rather than a claim about care: prettier discards a
  program's whitespace, rebuilds it from its structure and prints it back, so it cannot change what
  the code does. Verified afterwards by `tsc --noEmit`, 94 jest suites and 825 tests with no test
  edited, and a live run on a real emulator.

  Turn on `git config blame.ignoreRevsFile .git-blame-ignore-revs` once per clone so `git blame`
  looks through it; GitHub does so automatically.

- **The send-later queue names its post, so an interrupted send cannot leave a stray copy behind**
  (STOURIFY-166). Every attempt to send one queued post now carries the same `idempotency_key`,
  derived from the queue entry's own id — which is minted when you press **Share** and lives as long
  as the entry does.

  What this fixes: the app used to learn a post's id only from the server's reply and write it down a
  moment later, so a crash in that instant lost the id while the post survived, and the next attempt
  made a second one. Nothing you could ever see — the stray copy was unpublished and invisible to
  everybody, including you — but it was a real row on the server. The photos in the same send have
  worked this way since STOURIFY-161; now the post does too, from the same identity.

- **A post you share with no signal now sends itself later** (STOURIFY-161, under STOURIFY-104).

  Pressing **Share** in a tunnel used to fail with an error and hand the draft back, leaving you to
  remember to try again. Now the app keeps the whole post — words, audience, tagged spot and photos —
  tells you it will go out on its own, and sends it the next time it reaches the server. Think of a
  postbox: you do not stand there waiting for the van.

  While it waits you can find it under **Settings → Offline & sync**, in a new **Posts** section
  beside the queued spots and photos — a screen that opens with no network at all, reached from the
  Create menu. **Discard** throws a waiting post away if you change your mind. It leaves the Drafts
  page the moment it is queued, so one post only ever lives in one place and cannot be shared twice.

  Three things make it dependable rather than hopeful. The app **tries the real request every time**
  and only queues when the request genuinely never reached a server, so a working connection is never
  mistaken for a tunnel. Publishing a post is three steps — create it, upload each photo, publish it —
  and the queue **remembers where it got to**, so a signal that dies halfway does not produce a second
  post or a post missing half its pictures. And the queue is emptied by three separate triggers —
  regaining signal, reopening the app, and the **Retry all now** button — so no single one of them has
  to work for your post to go out.

  New: `src/db/models/PostOutbox.ts`, `src/features/social/api/postOutbox.ts`,
  `src/sync/postOutboxDrain.ts`, and the local-only `post_outbox` table, added by a v3 → v4 migration
  so nothing already waiting on the device is lost.

- **A prettier configuration, so a formatter that gets run here does less damage** (STOURIFY-162).

  `.prettierrc` records the style this code is actually written in — single quotes, no semicolons, a
  100-column print width, and each file's own line endings — read off the existing files rather than
  chosen fresh. `.prettierignore` keeps prettier out of the native projects and the generated
  directories.

  Read `docs/code-formatting.md` before pointing a formatter at anything here, because the config is
  a seatbelt rather than a fix: this code is hand-wrapped, so about 110 of the app's 244 TypeScript
  files still come out different under prettier at any print width. The disagreement is purely about
  where lines break — quotes, semicolons and trailing commas already match. Prettier is deliberately
  not a dependency, and there is deliberately no `format` script.

- **A draft's photo is now kept by the app, so it is still there days later** (STOURIFY-160, under
  STOURIFY-104).

  When you pick a photo, the gallery hands the app a borrowed address — a pointer into a folder
  Android empties whenever it wants the space. A draft saved with only that address could come back
  next week with the words intact and a blank square where the picture was.

  The photo is now copied into the app's own storage as the draft is saved, and the draft points at
  the copy. Deleting a draft, and sharing one successfully, delete the copy as well, so nothing
  accumulates on your phone.

  If a photo cannot be copied for any reason, the draft is still saved with what it had. A worse
  photo is a much smaller loss than a lost caption.

- **The app keeps a post you started but did not share, and there is a Drafts page to find it**
  (STOURIFY-159, under STOURIFY-104).

  Until now the New Post screen held your caption in memory and nowhere else. Walk away, lose
  signal, or let the phone die, and it was gone. It is now written to the phone shortly after you
  stop typing, and again when you leave the screen — so the worst case is roughly the last second
  of typing.

  **Profile → Drafts** and **Create → Drafts** both open the list, newest first. Continue puts you
  back where you were: the caption, the photo, the tagged spot and the audience you had chosen.
  Delete throws one away. Sharing successfully removes it from the list — and only success does, so
  a photo that failed to upload leaves your words exactly where they were.

  Nothing is written down until you have actually done something: opening the screen and backing
  straight out leaves no draft behind.

  A draft is kept on the phone rather than on the server, which is what makes it work with no signal
  at all. Two consequences worth knowing: a draft does not appear on your other devices, and nothing
  ever deletes one on its own — there is no expiry.

  It is reachable from the Create menu as well as your profile deliberately. The profile screen
  fetches your profile before it renders anything, so with no signal the one page written to
  reassure you that your unsent work is safe would be the one page you could not open — the same
  reasoning as STOURIFY-118.

  Under the surface: a local-only `post_drafts` table, added by a migration (database schema v2 →
  v3), so nothing already on the phone is touched.

- **Every password box now has a Show button** (STOURIFY-99).

  Password fields hide what you type, which is right when somebody is watching and unhelpful when
  you are alone fighting a long password you cannot check. Each one now carries a small **Show**
  button; press it and the characters appear, press **Hide** and they go back.

  It starts hidden every time, each field toggles on its own — Register's password and confirm
  boxes are independent — and revealing survives typing, so it does not snap back to dots while you
  are reading it. Leaving the screen re-hides it.

  The button is built into the app's shared text-field component rather than onto individual
  screens, so all six password fields get it at once: Login, Register's two, Reset password's two,
  and the change-password box on Settings. It is the word "Show" rather than an eye icon because
  this app installs no icon set, and a screen reader announces an emoji however the phone feels
  like — which is the wrong property for the one control whose meaning depends on its own state.

- **You can now read and write the replies on a note somebody left about a spot** (STOURIFY-148).

  Each note on a spot's About tab has shown a small reply count since STOURIFY-147, and tapping it
  did nothing, because the room those replies live in had not been built. Tapping it now opens that
  note's conversation, where you can read what people said and add to it. Your reply appears the
  moment you send it, and the count on the tab behind you catches up when you go back.

  Under the surface this is the app's existing comments screen learning a second kind of host
  rather than a second screen being built. The screen's thread indenting, its optimistic composer
  and the way it tells "we could not load this" apart from "there is nothing here" were never
  specific to posts, so a spot note inherits all of them unchanged — including the fix from
  STOURIFY-86 that stopped a failed request being reported as an empty thread.

  The screen is also now reachable from the Discover and Profile stacks, not only Home. A spot can
  be opened from search or from somebody's profile, and a thread that only existed on one of the
  three would have worked from the feed and crashed everywhere else.

- **The Spot screen's About tab is now a noticeboard other visitors can write on** (STOURIFY-147).

  A spot has always had one short description, written once by whoever added it — a brass plaque
  beside a landmark. The About tab now hangs a corkboard next to that plaque. Anyone who has been
  to the place can pin up a note, other visitors give a thumbs-up to the notes that turned out to
  be true, and the board sorts itself so the useful ones sit at the top. Each note shows who wrote
  it, how long ago, and how many people replied.

  Three details worth knowing, because each one is a decision rather than an accident:

  The plaque stays. The spot's own description, address and coordinates are still at the top of
  the tab — they are a different kind of fact, and the notes sit underneath them rather than
  instead of them.

  Tapping a heart answers immediately and quietly puts itself back if the request fails. Waiting
  for the network before filling in a heart reads as a broken button, so the screen changes first
  and the server's own count replaces the guess when the answer arrives.

  Writing a note does not place the note. The list is ordered by likes and the app does not own
  that ordering, so it asks the server again rather than guessing a position the row would jump
  out of a moment later.

  Reading the replies is not here yet — the count is shown, and the thread itself arrives with
  STOURIFY-148. New: `src/shared/api/spotAbouts.ts`, `src/shared/api/reactions.ts` (the app's first
  client for the platform's generic reactions endpoint, written for any record type rather than
  this one), and `src/features/spots/components/SpotAboutTab.tsx`.

### Fixed

- **Offline & sync no longer says nothing is waiting while something is** (STOURIFY-161). The banner
  at the top of that screen counted only queued spot and profile edits, so the first time a queued
  post could appear it rendered *"You're offline · Nothing waiting to send"* directly above one that
  plainly was. Queued posts are now counted. Queued photos still are not — that is the same bug, it
  predates this change, and it is filed separately rather than fixed here without cover.

- **Re-sending a post's photo can no longer attach it twice** (STOURIFY-161). Attaching a photo is a
  request whose reply can be lost on the way back, which looks exactly like a request that never
  arrived — so anything that retries has to be able to say *this is the same photo again*. Nothing
  retried that path until the send-later queue existed, so nothing ever passed that name. It does
  now, and a repeated attach collapses into one picture instead of two.

- **Two files no longer carry a whole-file reformat that nobody asked for** (STOURIFY-162).

  Landing STOURIFY-99 finished by running `npx prettier --write` over the two files it had edited.
  This repo had no prettier configuration, so prettier used its own defaults — double quotes and
  semicolons — where the code is written with single quotes and none. It rewrote both files end to
  end, and a forty-line feature landed as 459 insertions and 217 deletions. Nothing broke; the
  reader of the diff paid the whole cost.

  `src/shared/components/ui/Input.tsx` and `__tests__/components/ui.test.tsx` have been rebuilt from
  the commit before that feature, with the password reveal toggle re-applied in the house style. The
  same change now reads as 159 insertions and 26 deletions, and every line of it is the feature.
  Nothing about how the toggle behaves has changed.

- **A comment you had just posted jumped from the bottom of the thread to the top** (STOURIFY-151).
  You pressed send, the comment appeared at the end of the list, and a second later — when the
  screen re-read the thread from the server — the same comment was first. Nothing was lost, but the
  thing you had just written moved while you were looking at it, which reads for a moment as though
  it had not been saved.

  Two halves that were each written correctly, disagreeing about one thing. `CommentsScreen` showed
  the new comment instantly by adding it to the **end** of the list it was holding; both comment
  endpoints answer **newest first**. Showing it instantly is the right idea — it is a guess about
  the answer that is coming — and the guess was simply aimed the wrong way. It now goes to the
  front, where the server was always going to put it. Neither endpoint changed.

  The tests that should have caught this could not: both seeded an **empty** thread, where first
  and last are the same position. Three new ones seed a thread that already has comments, on both
  hosts, and one of them holds the create request open so it can read where the row landed *before*
  the server answers as well as after — because "does not move" is a claim about two moments, and
  checking only the second passes just as happily when the row jumped in between.

- **The two privacy switches in Settings do something now. Neither ever has** (STOURIFY-156).

  **Account Visibility** and **Follow Mode** were switches screwed to a wall that was never wired.
  They read from and wrote to an address on the server that has never existed, so both showed a dash
  instead of a value, and every tap failed silently — the app had no handler to say so.

  Meanwhile the one privacy setting the server really does enforce had no switch anywhere in the app.

  Settings → PRIVACY now has a single **Private account** toggle, and it is the real one. Turning it
  on means somebody who wants to follow you sends a request you have to accept, and people who do not
  already follow you cannot see who follows you or who you follow. That is one switch with two
  consequences, which is why there is no separate "follow mode" — on the server there never was one;
  it was the same setting under a second name.

  Three smaller things that matter if you use it. The switch shows what the server actually has
  stored, so it survives closing the app. If a save is refused the switch goes back where it was and
  says so, rather than sitting in a position that is not true. And if you have not set up your
  profile yet the row is visible but greyed out, with a line telling you why — a privacy control you
  cannot find is worse than one you cannot yet use.

- **A spot's photo grid shows the photos taken there. It never has before** (STOURIFY-155).

  Every spot in the app has a grid under its details that is meant to show what people have posted
  at that place. It has been empty on every spot, for everybody, since the app's very first commit
  in April 2026 — because the app was asking the server for those photos at an address the server
  has never answered at.

  It did not look broken, and that is why it lasted four months. The spot's own details arrive in a
  separate request that works fine, so the page rendered normally with one empty grid on it. An
  empty grid reads as a quiet spot nobody has visited yet, not as a failure.

  The photos were always there and always reachable; the app was simply knocking on the wrong door.
  The server lists posts filtered by which spot they belong to, which is the same door the app
  already uses to show one person's posts on their profile. It now uses that door here too, so a
  spot's grid shows the newest photos taken there, and only the ones you are allowed to see.

- **Liking a post works. It never has before** (STOURIFY-149).

  The heart under a post has been sending its request to an address nothing has ever answered at,
  since the app's very first commit in April 2026. Nobody saw it, because the screen turned the
  heart red before the request went out and put it back when the reply came — and a reply that
  says "no such address" comes back fast enough that the undo looked like a flicker. Nothing was
  ever saved. Closing the screen and coming back showed the like gone, which reads as the app
  forgetting rather than as never having been told.

  Likes now go through the same door every other kind of like in the app already uses — the one
  a note on a spot's About tab uses — and land on the server for good.

  Two smaller things came with it. The app now says which thing it wants, "like this" or "unlike
  this", instead of asking the server to flip whatever it currently holds; flipping is only correct
  while your copy is fresh, so two devices, or one screen left open, could turn a like into an
  unlike. And the count you see after tapping is the server's own, not the app's arithmetic — so
  somebody else liking the same post between two of your taps no longer leaves the number drifting
  until the next refresh.

- **A reply to a comment now appears in the thread, indented under the comment it answers**
  (STOURIFY-152). The app was never wrong here — it has always matched a comment's `parent_id`
  against another comment's `id`, and the server was sending a number for one and a name for the
  other, so the match could never succeed and the reply was silently dropped. The repair is on the
  server; what changed in the app is the tests, which had encoded the same wrong assumption as the
  code and therefore could never have caught it.

  A comment row now carries a `testID`, so a test can ask where a reply was **drawn** rather than
  only whether its words reached the screen — the old assertion passed just as happily when every
  reply was flattened to the left margin. The thread fixtures carry the shape the server actually
  returns, and one new test pins what the old failure looked like from outside: the reply is not
  misplaced, it is absent, with nothing on screen to say so.

- **`npm test` now ends when the tests do, instead of printing a green tally and sitting there**
  (STOURIFY-144).

  A shop that locks up for the night but leaves an oven timer running cannot set the alarm and go
  home. Node works the same way: it exits when there is nothing left to do, and one pending timer
  counts as something left to do however far away it is set for.

  React Query starts exactly such a timer for everything it holds — a cached request, and also a
  finished mutation — saying *after this long, throw it away*. Tests built those caches and walked
  away from them. Some of the timers were set for five minutes; the ones from the app's own
  `createQueryClient()` were set for a full day, because the offline cache has to survive in memory
  long enough to be written to the phone. So the suite passed in about a minute and the process
  stayed alive for as long as anyone was willing to wait, which is indistinguishable from a
  deadlock — and had already cost one run being killed and started again.

  Every `QueryClient` a test builds now goes through `trackQueryClient()` in
  `__tests__/support/queryClients.ts`, which shuts them all down when the test file finishes. Two
  things about that file are worth knowing before changing it: `gcTime: 0` disarms the query half of
  a cache and does nothing for the mutation half, and emptying a mutation cache does **not** cancel
  its timers the way emptying a query cache does — the mutations are destroyed by hand for that
  reason.

  Measured on Windows, five runs in a row: 85 suites, 687 tests, green, and the process gone within
  two seconds of the tally. Before the fix the same suite sat for five minutes or more. The default
  parallel run also stopped reporting `A worker process has failed to exit gracefully`, which turned
  out to be the same leak wearing a different message.

- **A screen's saved copy now survives every offline restart, not just the first one**
  (STOURIFY-121).

  Think of a shop that photocopies head office's price list and keeps it in a drawer. The rule at
  closing time was *"file today's list, but only if we actually got through to head office today."*
  On the first day the phone line is dead that is harmless — yesterday's copy is still in the
  drawer. But nothing gets filed that evening, because there was no call, so on the second
  dead-phone day the drawer is empty and stays empty until the line comes back. That was the app:
  with no signal, the first cold start showed the saved profile and every restart after it showed
  *"We could not load your profile"*, which is precisely backwards — the second restart in a tunnel
  or on a flight is when a saved copy is worth the most.

  Two library behaviours combined to cause it. React Query labels a request by its **most recent**
  attempt, so a request still holding good data from an earlier success flips to `error` the moment
  one refresh fails. And the persister rewrites the **entire** saved file on every cache change
  rather than editing entries in place, filtering it through a rule that by default keeps only
  `success` — so rejecting an entry does not skip it, it deletes it. The offline session therefore
  spent itself erasing the copy it had just read.

  The rule now keeps a request whose last attempt succeeded **or** which is still holding data, and
  it lives in one place (`src/shared/queryClient.ts`, exported as `shouldPersistQuery` inside the
  `persistOptions` that `App.tsx` hands to the provider) so the app and its test cannot drift apart.
  A request that has only ever failed carries no data and is still not saved: a saved failure is not
  a saved copy of anything, and rehydrating one would open a screen showing an error inherited from
  a previous run instead of trying to load. The 24-hour window and the version-based cache reset are
  unchanged. The guarding test exercises **three** cold starts — a single-restart test passes
  against the broken code, which is how this reached a real device.

- **Onboarding's Skip and Continue buttons no longer sit under the phone's own navigation bar**
  (STOURIFY-81).

  Every phone keeps a strip along the bottom of the screen for its back, home and recents controls,
  and tells each app how tall that strip is so the app can stay out of it. Onboarding did not stay
  out of it. On a Pixel emulator with the three-button bar, the **Skip** link on *"What draws you to
  a place?"* was drawn from y=2267 to y=2382 while the navigation bar started at y=2298 — so 84 of
  the control's 115 pixels, nearly three quarters of it, lay underneath the phone's own buttons. A
  tap there can go to the system instead of the app, and Skip is the only way past that step for
  someone who does not want to pick interests. A brand-new user could be stuck on it thirty seconds
  into the app.

  The cause was one word. Each onboarding screen wraps itself in a `SafeAreaView` and hands it a
  list of screen edges it is allowed to pad; the list said `top` and nothing else. The rest of the
  app gets away with that because every other screen sits inside the tab navigator and the tab bar
  already fills the strip — onboarding is its own stack, with nothing in the way. All four
  onboarding screens now name `bottom` as well, including the Enable-location screen, whose buttons
  are centred today but sit one copy-edit away from the same bug. Measured again on the same
  emulator afterwards: Skip ends at y=2256, a 42-pixel gap above the bar, and tapping it advances
  the flow.

- **The Profile tab works with no signal, so Settings is reachable again** (STOURIFY-120).

  A shop with a photocopy of yesterday's price list in the back room does not shut when the phone
  line goes down — it hangs up a sign saying prices may be out of date and carries on serving
  people. The app keeps that photocopy: every finished request is written to the device and read
  back the next time the app starts. The Profile screen simply never looked at it. One failed
  request painted *"We could not load your profile"* over a profile it already had, and behind that
  wall sat **Settings**, and behind Settings sat **Blocked accounts** and **Offline & sync** — none
  of which need a network to be useful.

  Now the wall only appears when there is genuinely nothing to show. A saved profile renders as
  normal under one muted line saying it could not be refreshed and may be out of date, and when
  there really is nothing saved — a first run with no signal, or a copy older than the cache's 24
  hours — the failure state offers **Settings** beside **Try again**. Two answers from the server
  still clear the screen outright rather than being served from the cache: `403`, which is what a
  block looks like, and `404`, which means the profile is gone rather than unreachable.

- **Work you saved with no signal is reachable again after the app restarts** (STOURIFY-118).

  Picture a parcel locker with no window. A spot published in airplane mode really is saved on the
  device and really does upload itself later — that was measured end to end. But once the app was
  killed and started again, still offline, there was no way to look at it. **My spots** was
  reachable only in the seconds right after publishing, and **Sync status** sat behind the Profile
  screen, which fetches your profile and stops at *"We could not load your profile"* when it cannot.
  So the one screen written to reassure somebody their unsent work is safe was behind the one screen
  that needs the network they do not have.

  The Create menu — the sheet behind the centre ⊕ tab — now carries a **Your work** section linking
  to **My spots** and **Offline & sync**, and the sync screen is registered in the Create stack as
  well as the Profile stack. Nothing about the queue, the local database or the upload path was
  touched: they were already correct, and this was only ever a question of being able to get to
  them. Giving the Profile screen its own offline path is tracked separately as STOURIFY-120.

### Added

- **A release build you are allowed to test against the development server** (STOURIFY-117).

  A release build of the app is the only build that carries its JavaScript inside the APK, so it is
  the only one that can start with no network at all. It is also the one build Android forbids from
  making plain, unencrypted requests — and the only backend this project's tests may drive is a
  plain `php artisan serve` on the developer's own machine. The build we needed for offline testing
  was therefore the one build that could not reach the one server it was allowed to reach. It could
  not even sign in.

  There is now a third Android build type, `releaseDev`, which copies the release build in every
  respect and adds exactly one thing: permission to talk plain HTTP, carried in its own source set
  at `android/app/src/releaseDev/AndroidManifest.xml`. The build that goes to Play is untouched, and
  that is measured rather than asserted — its merged manifest carries no `usesCleartextTraffic` and
  no `networkSecurityConfig`. `__tests__/android/cleartextTraffic.test.ts` fails if anybody moves
  the opening onto the main manifest, where it would ship to every user.

  How to build it, and the one command a reviewer runs to confirm the shipped build is still locked
  down, are in `docs/building-a-dev-release-apk.md`.

### Changed

- **The Compose screen's Visibility picker opens on 🔒 Private** (STOURIFY-105). It used to open on
  🌍 Public, so an author who never looked at the picker published to everyone by accident. Private
  is now the option already selected, and a post shared without touching it is private. Public and
  Followers are still one tap away, unchanged.

### Fixed

- **Spot cards in the Discover grid line up, and their review figures stay on the card**
  (STOURIFY-101).

  Two cards sit abreast in the grid, so anything that changes height between one and the next
  knocks everything below it out of line — and one of them ran out of room entirely.

  - **The category tag always occupies its strip.** The little "Shopping" pill was drawn only
    when a spot had a category, so a card with one pushed its title about 22 points lower than
    the card beside it. `SpotCard` now reserves that strip whether or not there is a tag, the way
    a printed form leaves a blank box for a middle name so every field beneath it still lines up.
  - **The title reserves two lines.** Same problem one row lower: a one-line title and a
    two-line title left the stars underneath them at different heights.
  - **The review figures moved under the stars.** `Rating` put five stars, the score and
    "· 12 reviews" on a single row that could neither shrink nor wrap. A grid cell has about 120
    points of room inside and that row wants nearer 150, so the end of it simply ran off the
    card's edge. `Rating` gained a `stacked` arrangement — stars on one line, "4.5 · 12 reviews"
    on the next — which `SpotCard` uses in the grid layout. Both arrangements are now capped at
    one line and allowed to shrink, so nothing can spill in any holder.

  The `wide` list layout is deliberately untouched: a list row is as wide as the screen with
  nothing beside it, so there is nothing to line up with and reserving space would only waste it.
  "Spots near me" was reported on the same card as wrapping onto two lines; STOURIFY-102's
  one-line button label had already fixed it, and this card confirmed the words still fit
  without being cut short.

  Files: `src/shared/components/ui/SpotCard.tsx`, `src/shared/components/ui/Rating.tsx`.

- **Three tidy-ups on the spot screen and the photo viewer** (STOURIFY-102).

  A shop window with three small things wrong with it: a sign too wide for its board, a "keep
  this shop" button stranded on a shelf of its own, and a picture frame painted the wrong colour.

  - **Button labels stay on one line.** `Button` now renders its label with `numberOfLines={1}`
    and lets it shrink, so a long label is shortened with an ellipsis instead of wrapping onto a
    second line and making two side-by-side buttons different heights. Every button in the app
    inherits this, not just the two that were reported. `Button` also gained an optional `icon`
    prop for icon-plus-text buttons; the icon is decoration and is left out of the button's
    accessibility label.
  - **Save sits beside the rating.** On the spot screen, `Save` moved out of its own full-width
    row and onto the rating line as a compact icon-plus-text button, filling space that was
    empty. The reviews button also dropped the count from its own label — `See all 12 reviews`
    became `See all reviews` — because the count is already printed one line above in the rating
    row, and eighteen characters never fitted in half a phone's width.
  - **Photos use the theme background.** The full-screen photo viewer painted itself with
    `theme.colors.ink`, the *text* colour, so a light-themed app opened a near-black screen and
    framed every photo in near-black bars (photos are drawn with `contentFit="contain"`). It now
    uses `theme.colors.surface`, as does the photo itself. The feed's `PostCard` photo, which
    declared no background at all and borrowed whatever sat behind it while loading, now uses
    `theme.colors.surfaceAlt`.

  Files: `src/shared/components/ui/Button.tsx`, `src/shared/components/ui/PostCard.tsx`,
  `src/features/spots/screens/SpotDetailScreen.tsx`,
  `src/features/spots/screens/PhotoGalleryScreen.tsx`.

- **The on-screen keyboard no longer covers the field you are typing into** (STOURIFY-100).
  Reported against "Confirm password" on the registration screen; it was never limited to that
  field.

  Picture the screen as a sheet of paper in a tray. Android used to shrink the tray when the
  keyboard slid up, so the paper got shorter and everything still fit above it — that is what
  `android:windowSoftInputMode="adjustResize"` in the manifest asks for, and it is still there.
  It stopped working when the app went **edge-to-edge** (`edgeToEdgeEnabled=true`, which Expo
  SDK 54 requires): the app now draws all the way to the physical edges of the screen, keyboard
  included, Android no longer resizes anything, and the app is handed the keyboard's height to
  deal with itself. Nothing in the app did — there was not one `KeyboardAvoidingView` in `src/`.

  New shared `KeyboardAwareScreen` primitive (`src/shared/components/ui/`) carries the fix, so a
  new form inherits it instead of repeating the bug. Applied to the four auth screens, Create
  Spot, Write Review, Post Compose and Edit Profile; the comment composer on Comments, the
  delete-account dialog in Settings, and the `Sheet` primitive (which covers Report and every
  future sheet with a field in it) each got the same treatment in the shape that suited them.

  The shared component also sets `keyboardShouldPersistTaps="handled"`, which fixes a second,
  quieter annoyance: a tap on a button below the fields used to be spent dismissing the keyboard,
  so everything needed two taps.

  Left alone on purpose: Search, Spot Picker and Follow Suggestions. Their search box is pinned to
  the top of the screen, where the keyboard cannot reach it.

- **Every native library in the release APK is now built for 16 KB memory pages** (STOURIFY-80).
  A phone hands out memory in fixed-size blocks called *pages* — 4 KB on older Android, 16 KB on
  devices from Android 15 onwards, which is faster. A library compiled for the old block size will
  not load on the new one, and Google Play now **requires** 16 KB support, so a single stale
  library is a rejected submission rather than a slow app.

  Measured against a real release APK: 42 of its 44 native libraries were already correct, because
  React Native's and Expo's Gradle plugins pass the linker the flag that asks for 16 KB. The two
  that were not are both copies of `libwatermelondb-jsi.so` — a dependency that brings its own
  plain Android library build and therefore inherits none of that, silently, with no warning at
  build time.

  `android/build.gradle` now injects `-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON` into **every**
  Android subproject's native build, rather than into the one that happened to be wrong. The
  dependency's own Gradle file lives in `node_modules`, which is not committed, so a fix there
  would disappear at the next `npm install` and return as a mystery Play rejection.

  Check any build with `bash scripts/check-apk-16kb-alignment.sh` from the repo root.

### Changed

- **The app's package name is now `com.zivsluck.stourify`, was `app.stourify.mobile`**
  (STOURIFY-94). A package name is the app's permanent identity on a device — the thing Android
  uses to tell one installed app from another — so it now sits under the operator's own
  reverse-domain namespace, alongside the other products on that domain. Changed in
  `app.json` (Android `package` and iOS `bundleIdentifier`), `android/app/build.gradle`
  (`namespace` + `applicationId`), the `.maestro` flow's `appId`, and the Kotlin source tree,
  which moves by hand to `com/zivsluck/stourify/` because this pipeline commits `android/`
  instead of running `expo prebuild`.

  Two consequences, both of which look like an unrelated bug if you do not know the rename
  happened. Android treats the new package as a different app, so **an existing install must be
  uninstalled before the new APK will install** — anything created offline and not yet synced is
  lost with it. And the Google Maps key is restricted to a package-name + SHA-1 pair, so **until
  the new pair is added in the Cloud console every map is a grey canvas** on an otherwise good
  build. Nothing in this repo can catch that second one; `docs/google-maps-api-key.md` now says
  so at the restriction table.

- `.gitignore` now covers `.env.bak-*`. The APK builder copies `.env` aside before rewriting it,
  and that copy carries the same secrets as the original — it was left stageable.

- **Release builds ship two architectures instead of four, and Gradle runs one worker with no
  daemon.** `reactNativeArchitectures` drops to `arm64-v8a,x86_64` and `android/app/build.gradle`
  gains a matching `ndk { abiFilters … }`. Every Android phone since roughly 2019 is arm64;
  `x86_64` exists only so the emulator can run the same APK. Building `armeabi-v7a` and `x86` as
  well compiled all native code twice over for devices this app does not target.

  The daemon is off because it is a long-lived JVM that caches the environment it started with —
  change `.env` and it keeps handing Metro the old API URL, so the APK ships a bundle pointing at
  the wrong backend while every file on disk says otherwise. A cold JVM costs about fifteen seconds
  and removes a class of bug where the fix is real but the artifact does not contain it.

  Verified in the built APK: `lib/arm64-v8a` and `lib/x86_64` only, 66 MB.

- Per-release APK notes now live in `changelogs/<version>.changelog.md`, next to a `README.md`
  explaining the split from this file. This one is for developers and answers "what changed in the
  codebase"; those are for the person installing the APK and answer "what is different on my
  phone". The builder script refuses to build without one, because a release note has no technical
  dependency on anything — which is exactly why it gets skipped.

### Added

- **Discover has a map now, and a button on the grid that opens it.** (STOURIFY-54) The grid answers
  "what is there". The map answers "what is near the thing I am looking at", which is the question
  somebody standing in a city actually has. Pins are the same spots the grid shows — one fetch, one
  cached page — so tapping a pin floats a small card for that place and opens it, and a recenter
  control brings the map back and clears the selection.

  **It opens on something even when the phone will not say where it is.** That is what separates it
  from the Nearby screen, which is about what is within a few kilometres of *you* and correctly
  refuses to draw a map with no fix. This one falls back in three steps: the device's position, then
  the explorer's home city read from the local database, then General Santos, where Stourify's first
  spots are. Every step after the first works with the radio off.

  Under the hood the "where do I point a map with no fix" helper moved out of the spot-creation
  feature and into the shared map seam (`src/shared/map/fallbackCenter.ts`), because two features now
  open on it and one feature reaching into another's folder is the sideways dependency this codebase
  does not allow. No behaviour changed with the move.

- **Discover shows real places now, as a grid of photos.** (STOURIFY-53) The tab used to open on a
  note saying the browsing feature was coming in a later milestone. It now opens on a two-column
  mosaic of spots read from `GET /api/v1/spots`, and tapping a cell opens that spot.

  Two details do most of the work. **Cells draw the 400x400 thumbnail, never the original upload.**
  A cell is about 170 points wide and an original is often several megabytes, so this is the
  difference between a grid that fills in over a phone connection and one that appears to hang. When
  a photo's thumbnail has not finished converting the cell shows its placeholder tile rather than
  falling back to the original — the fallback looks harmless and is how a grid quietly goes back to
  downloading full-size images.

  **And it still works with no signal.** The app already writes every server answer to disk for 24
  hours, so the grid renders yesterday's page the moment it opens and lets the refresh fail quietly
  in the background. Like a magazine already in your bag: still readable in a tunnel.

  The filter chips along the top are still decorative. Making one filter needs a category rule the
  server does not have, and a chip wired to a parameter the server ignores would look like it worked
  while returning the unfiltered list every time.

### Fixed

- **The photo gallery no longer says a spot has no photos when it never heard back about the spot.**
  (STOURIFY-89) Open a spot's photos on a bad connection and the full-screen gallery said *No photos
  yet — This spot has no photos to show yet.* That is a statement about the place. What had actually
  happened was a statement about the network: the request for the spot never came back. Told the
  shelves are empty you go home; told the lights are off you come back in ten minutes, which is the
  one move that helps.

  The screen kept a single list of photos that was empty in three completely different situations —
  the spot has not arrived yet, the request broke, and the spot really has no photos — and printed
  the third one's sentence for all three. It also had no loading treatment at all, so a slow request
  showed the false sentence too rather than a placeholder.

  It now tells the four situations apart in that order: could not ask, still asking, here are the
  photos, asked and there are none. The failure state says so plainly and offers a **Try again** that
  re-runs the request, and a request in flight gets a placeholder. The *No photos yet* sentence is
  unchanged — a failure state was added beside it, not over it.

  **Photos already loaded survive a failing refresh.** The failure panel appears only when there is
  no spot to show, so somebody offline on a spot they opened yesterday keeps swiping the photos
  instead of being handed an apology for not having them. This screen is not a list, so it could not
  use the `ListEmptyComponent` placement its sibling screens rely on for that protection; it takes
  `SpotDetailScreen`'s shape instead, which reads the very same request — two screens fed by one
  request must not disagree about whether it came back.

- **Your posts grid and your blocked list no longer report a failed request as an empty list.**
  (STOURIFY-87) Two more screens in the Profile stack asked their list one question — *are we still
  loading?* — and treated every other answer as "there is genuinely nothing here". So a request that
  timed out produced a confident falsehood: *You have not posted yet.* to somebody with a full grid,
  and *Nobody blocked — you have not blocked anyone.* to somebody who had.

  The blocked list is the one worth naming. That is safety copy, and getting it wrong tells a person
  checking that a block still stands that it does not. Now each screen tells the three situations
  apart — still asking, could not ask, asked and there is nothing — and the middle one says so and
  offers a **Try again** that re-runs the request. Both empty sentences are unchanged; a failure
  state was added beside them, not over them.

  **The blocked list also had its structure corrected, and that is the larger half of this change.**
  Its loading check sat *above* the list, deciding whether the list existed at all rather than what
  to show when it was empty. That check has been moved inside the list's own empty component, where
  every other screen in the app keeps it. The distinction matters because the app keeps serving rows
  it already holds while a later request fails: a check above the list can wipe out content the
  reader could still be reading, and would never once show that it had, because that branch is
  unreachable while the network is up.

  The posts grid gained the shared empty-state block so it could carry a retry at all — it had been
  a bare line of text. Its failure message names the *posts*, not the profile, because the header
  above it may have loaded perfectly and two failure messages about one profile would read as two
  separate faults.

- **Comments and Activity no longer report a failed request as an empty list.** (STOURIFY-86) A shop
  with the lights off looks exactly like a shop with empty shelves. Told the shelves are empty, you
  go home; told the lights are off, you come back. Both screens asked their list one question — *are
  we still loading?* — and treated every other answer as "there is genuinely nothing here", so a
  request that timed out produced a confident falsehood: *No comments yet* on a post that may be full
  of them, *Nothing yet* to somebody with follow requests waiting.

  Each screen now tells the three situations apart — still asking, could not ask, asked and there is
  nothing — and the middle one says so plainly and offers a **Try again** that re-runs the request.
  The empty sentences are unchanged; a failure state was added beside them, not over them.

  The new branch sits **inside** `ListEmptyComponent`, which renders only when the list has no rows
  at all, so comments or requests already loaded stay readable when a later fetch fails. Putting the
  check above the list instead would silently delete that protection, and never show it had, because
  that branch is unreachable while the network is up. Same shape as `FeedScreen`, `DiscoverScreen`,
  `NearbyScreen` and `SearchScreen` before them.

- **Onboarding stops throwing away the interests and home city you just picked.** (STOURIFY-82) Both
  screens saved into the local copy of the profile table, and both were wrapped in a check that a
  profile row was already there. For a brand-new account it never is — nothing has synced one down
  yet — so the check was false every time and the answers went nowhere. A save guarded on the very
  thing it is supposed to be saving never runs.

  A new `features/onboarding/persistProfileChoice.ts` owns the choice between the two writers: the
  local row when it exists, because that path works with no connection and drains through the normal
  push queue, and `PATCH /profile` when it does not. A failed send is swallowed rather than surfaced —
  these are four taps in somebody's first thirty seconds, and blocking the flow on a flaky connection
  would be worse than the bug being fixed.

- **Your own Profile tab no longer describes you in the third person, or dead-ends.** (STOURIFY-82) A
  failed read of your own profile showed the message written for visiting a stranger — *"This explorer
  has not set up their profile yet"* — with **Go back** as the only control. It now says
  **We could not load your profile** and offers **Try again**, because a read that failed is worth
  retrying and a profile that is not there is not. The stranger's 404 and the blocked-pair 403 are
  unchanged.

- **Search no longer reports "No results" for a search that never ran.** (STOURIFY-59) Ask a shop
  assistant whether something is in stock, watch them fail to get the stockroom door open, and hear
  them come back with "we don't have it." That was Search: a request that failed showed the same
  **No results** message as a search that genuinely matched nothing, so the reader retyped the word,
  got the same sentence, and concluded the place they were looking for is not in Stourify.

  A failed search now says **Couldn't run your search** and offers a **Try again** button that runs
  the same search again. The other three states are unchanged and still distinct: the prompt before
  you have typed two characters, "Searching…" while the request is in the air, and "No results" only
  when the server actually answered with none. Results already on screen are never covered by the
  failure message — the reader keeps reading what they have while a later request fails behind it.

- **Nearby no longer answers before it has asked.** (STOURIFY-66) Ask a librarian whether they have a
  book and watch them walk off to check. What you do not want, while they are still walking, is a sign
  on the desk reading "We don't have it." Opening Nearby, the app spends up to eight seconds working
  out where you are — and the strip of spots along the bottom already said **No spots nearby**, about
  ground it could not yet name.

  The strip now stays quiet until the request has actually been made. The map above it is already
  showing a spinner for that same wait, so a second one underneath would only repeat it. Once a
  position arrives, the strip behaves exactly as before: spots if there are any, "No spots nearby" if
  the area is genuinely empty, and the retry row if the request failed.

- **Nearby stopped telling you the area is empty when it was the request that failed.** (STOURIFY-60)
  "No petrol for 50 miles" is a useful sign. Hung on a station whose power is out, it is a lie — there
  is petrol, the pump just could not answer. The strip of spots along the bottom of the Nearby map put
  up **No spots nearby** in both situations, and only one of them is about where you are standing. A
  reader told the area is empty walks somewhere else, which is the single move that cannot help.

  A failed request now gets its own row — **Couldn't load nearby spots · Tap to retry** — and tapping
  it asks again. A request that genuinely comes back with nothing still says "No spots nearby". This
  is the same three-way split Discover and the feed already use, in a shape that fits a strip 200
  pixels tall: the full block those screens use would be clipped here, and a retry the reader cannot
  reach is worse than the wrong sentence.

  Spots already on screen are never covered by the failure row. Lose signal with the strip full and
  the spots stay exactly where they were.

- **A spot that failed to load stopped filling the page with furniture.** (STOURIFY-65) A shop with a
  hand-written *closed, back soon* note in the window is honest, and you walk away. Tape the same note
  over a display of empty boxes with last week's prices on them and you stop believing the shop. The
  spot screen was the second one: under the "Couldn't load this spot" panel it carried on as though
  the request had worked — a title of `...`, a **See all 0 reviews** button, and **Write a review** and
  **Save** buttons offering to review and bookmark a place the app had just admitted it could not
  identify.

  None of that is drawn now. Everything in that strip is either a fact about the spot or an action on
  it, so when there is no spot, none of it has anything true to say. What stays is the failure panel,
  the Posts and About tabs, and every post that loaded — because the posts come from a **separate**
  request that often succeeds, and hiding content that arrived fine is the same mistake in the other
  direction.

  **The About tab also stopped printing a stray comma.** The coordinates line was two numbers with a
  comma between them, and with no spot to read there were no numbers — leaving a lone `, ` sitting
  under the address. It now appears only when there is actually a coordinate to show, which fixes the
  same line for a spot that loaded perfectly well but has no location recorded. A spot on the equator
  still shows `0.0000`: zero is a place, not a missing number.

- **A spot that failed to load waited forever, and never said so.** (STOURIFY-64) A lift button that
  lights up and stays lit is worse than a sign on the door. The light says help is coming, so you
  stand there; the sign says use the stairs, so you get where you were going. Open a spot with no
  connection and the screen was the lit button — two pulsing grey shapes where the photo and the star
  rating go, no message, no button, and no end to it. Leaving the screen was the only way out.

  The spot screen now says **"Couldn't load this spot"** and offers a **Try again** that asks the
  server again, the same treatment Discover and the feed already give a request that fails. The
  rating stops pretending too: it renders nothing rather than a placeholder that can never resolve,
  which also stops a screen reader announcing "Loading" over a request that finished — badly —
  minutes ago.

  **A spot the app already has still wins.** Open a spot, go into a tunnel, come back to it: the
  refetch fails and you keep reading the spot, with no error shown. The failure panel appears only
  when there is genuinely nothing to show, which is the same rule the feed and Discover follow.

- **A spot you were still waiting on said "No photos yet".** (STOURIFY-63) A departures board that
  has not yet heard from the railway should say so, not print CANCELLED. One of those sends you to
  the platform to wait; the other sends you home. The spot screen was printing the second: open a
  spot on a slow connection and the top of the screen announced it had no photos, before anyone had
  asked the server whether it did. A spot with twenty photos looked like a spot with none for as
  long as the request took, and anyone who tapped away in that window never found out otherwise.

  The hero now waits visibly — the same pulsing placeholder the star rating just below it has always
  used — and only says "No photos yet" once the answer is actually in, unchanged from before. The
  cause was the order of two questions: the screen asked "are there photos?" before "has this
  loaded?", and an empty list is the answer to both.

  One thing this deliberately did not fix: a spot request that *fails* sat on that placeholder rather
  than saying anything, which is quiet rather than wrong. The honest version — a message and a
  **Try again** button, as the feed got in STOURIFY-41 — is the STOURIFY-64 entry above, and ships
  alongside this one.

- **A feed that failed to load said "your feed is empty".** (STOURIFY-41) A shop with the lights off
  and a shop with empty shelves look the same through the window at night. The feed had that problem:
  when the request to the server failed, it put up the same sign it uses when the server answers and
  genuinely has nothing to show you. Those are different facts, and only one of them is yours to
  solve — told your feed is empty you conclude the app has nothing for you and stop, when a single
  tap would have fixed it.

  A failed feed now says "Couldn't load your feed", explains that your posts are still there, and
  offers a **Try again** button. A feed that really is empty still says so, unchanged.

  Two things stayed deliberately as they were. Posts you already have still win: if the app has
  yesterday's feed saved and today's request fails, you read the saved posts and see no error at all.
  And the 15-second timeout that makes these failures common on a slow connection is untouched here —
  it is a single setting shared by every call in the app and is tracked separately as STOURIFY-61.
  The same confusion on the Search and Nearby screens is tracked as STOURIFY-59 and STOURIFY-60.

- **A spot-detail test tapped the hero photo before the screen had finished wiring it up, so the
  whole mobile suite went red at random.** (STOURIFY-62) The test waited for the hero *button* to
  appear and then tapped it. That button is on screen from the very first frame, before the spot's
  photos have loaded, and the screen deliberately keeps it dead until there is a gallery to open. So
  the wait was satisfied while the screen was still loading, and whether the tap worked came down to
  how busy the machine was — green when idle, red often enough to block every other mobile change
  from merging.

  What made it hard to see is that the button *reported itself as enabled* at the moment of the tap.
  React Native hands a `Pressable`'s `disabled` setting to its underlying touch handler in an effect
  that runs after the screen is drawn, so for one flush the visible button and the thing that
  receives touches disagree. It is a lift whose panel lights up a moment before the buttons are
  actually connected.

  The test now waits for the hero *photo*, which only exists once the spot has loaded — the exact
  condition the tap depends on — and a second assertion pins the deliberate behaviour it uncovered:
  a hero with no photos does not open a gallery. No app code changed; there was no user-visible
  defect to fix, because the disagreement lasts less than a frame.

- **Edit Profile saved to an address that did not exist, and edited the wrong thing.** (STOURIFY-38)
  The screen posted `PUT /user/profile`, a route no file in the project declares, so every save
  answered 404 — you filled the form in, pressed Save, and nothing was stored and nothing said so.
  It now saves to `PATCH /api/v1/profile`, which was already there all along.

  The second half of the bug was what the form collected. Stourify keeps two separate things about
  a person: the **platform account** (a name, an email, a login) and the **explorer profile** (the
  username, bio, website, home city and interests other explorers actually see). The old form
  collected the account's name plus the profile's bio and posted them together, which meant the
  whole explorer identity was uneditable once onboarding was over. The screen now edits the five
  identity fields, and the account's name and email stay where they belong.

  This also un-breaks the one recovery path for somebody who skipped onboarding: the profile
  header's "Set up profile" button routes here, and the endpoint creates and edits with the same
  call, so a first save works exactly like a later one.

  **Saving needs a connection, unlike the rest of this app.** Onboarding writes this same table
  offline and lets the sync queue push it. This screen deliberately does not, because a username
  has to be unique across the whole platform and only the server can say so — written locally, a
  taken username would look saved and then fail inside a background push with nowhere to show the
  error, leaving somebody with a username they do not have. When the server refuses, its own words
  ("That username is taken.") now appear under the field they belong to instead of as one line at
  the bottom, and the message goes away as soon as you start typing a different name. The screen
  also moved onto the design system; it was the last profile screen still carrying hardcoded
  colours.

  **Two things the unit tests could not have found, both caught on a real emulator.** The save
  reached the server and the profile header underneath still showed the old bio, because the screen
  filed its copy of the profile under a name nothing else in the app used — it dropped a cache entry
  no one was reading. And because this app keeps that cache on disk between launches, re-opening the
  form filled it in from the copy left over from last time; a save from that state would have
  written yesterday's values back over today's. The form now waits for the fresh answer before it
  fills anything in.

- **Corrected a stale note on the media type that pointed callers the wrong way.** (STOURIFY-53)
  `SpotMedia.thumb_url` in `src/shared/api/types.ts` carried a comment saying no thumbnail
  conversion existed, that the field was always empty, and that callers should render the original
  and shrink it themselves. That was accurate when it was written and stopped being accurate when
  the conversions shipped. A stale instruction inside a type is worse than none, because it is read
  at exactly the moment somebody is deciding what to do.

- **A broken sync no longer holds your photos hostage.** (STOURIFY-29) A sync cycle does four things
  in order: send up what you wrote offline, check nothing was refused, fetch what is new on the
  server, and upload the photos waiting to go with your posts. If step three failed — the server
  answering with an error, say — the app turned around and went home, and the photos never left the
  queue. They waited for as long as the server kept failing, with no error, no failure count, and
  nothing on the Sync Status screen saying why. They went up the instant fetching started working
  again, which is what made this so hard to notice: nothing was ever lost, it was just late by
  however long the fault lasted.

  A photo never needed anything from step three. The one thing it genuinely waits on is the post it
  belongs to existing on the server, and the upload code already checks that for itself, photo by
  photo.

  The fix is where the upload step sits rather than what it does: it moved into the cycle's `finally`
  block in `src/sync/cycle.ts`, so the language itself guarantees it runs on every way out — the
  failed fetch, a refused row further up, an unexpected crash, or a clean pass. Putting it anywhere
  else would have fixed today's four exits and none of the ones somebody adds later, which is exactly
  how the bug arrived. It is wrapped so that nothing it does can change what the cycle reports, in
  either direction.

  The rule pointing the other way is untouched: a stuck photo still cannot delay incoming data,
  because the upload step still runs last.

### Security

- **Photos no longer upload the coordinates they were taken at.** (STOURIFY-40) A camera writes hidden
  information into every photo file — the time, the phone's make and model, and, with location
  services on, the exact spot the photographer was standing. None of it shows when you look at the
  picture, and Stourify was uploading all of it: the original file is served at a public URL, and
  nothing anywhere in the upload path rewrote a single byte. For a location app the dangerous photos
  are the ones somebody takes at home and posts without tagging a place — the picture shows a kitchen,
  the metadata says which kitchen.

  The removal happens on the phone, before the bytes leave it, so the coordinates never reach a server
  at all. `src/shared/media/stripImageMetadata.ts` is the whole mechanism, and it needs no image
  library: a JPEG is a chain of labelled blocks and the metadata is *its own blocks*, so the file is
  copied with those blocks left out. The picture data comes through byte-for-byte — nothing is
  re-encoded, so no photo loses quality — and no new native dependency was added, which is why this
  needs no new development build.

  Wired into all three places bytes are read: `features/media/api/queueLocalMedia.ts` (which now
  reads, strips and writes instead of calling the filesystem's `copy()`, so a photo waiting in the
  offline outbox is already clean while it waits), `features/social/api/uploadPostMedia.ts` (the
  second upload path, which never enters the outbox at all), and `sync/mediaDrain.ts` (a second pass,
  which covers a photo queued by a build that predates this change).

  Deliberately not covered, and said plainly in the privacy policy rather than glossed over: PNG and
  HEIC stills, and video, which can carry a location of its own. A JPEG the code cannot parse makes
  the upload fail rather than going out unstripped.

### Added

- **The new-spot form captures where you are instead of asking you to type it.** (STOURIFY-4) Adding
  a spot used to mean typing a latitude and a longitude into two boxes — the equivalent of being
  asked for your own address in GPS numbers. Nobody standing at a waterfall knows they are at
  `6.1164, 125.1716`, and one mistyped digit put the spot in the sea with nothing to flag it, because
  the wrong number is still a perfectly valid number.

  The screen now reads the phone's own position when it opens, shows it on a map, and lets you drag
  the pin if the phone's guess is off. The coordinates appear as text you can read and cannot edit,
  with the accuracy in metres beside them, so a 12-metre fix is distinguishable from a rough one.

  The two paths that are not the happy one are built rather than assumed:

  - **Location refused.** One sentence saying so, plus a working map centred on your home city — read
    out of the local database, so it works with no signal — or on General Santos City when there is
    no profile to read. You place the pin yourself.
  - **Offline.** The map and the pin stay; only the imagery is missing, and a line says so and says
    it will fill in later. Placing a pin needs no map tiles, and dropping the map offline would remove
    the only way to correct a position exactly where people most often have no signal.

  New: `src/features/create/components/LocationPicker.tsx`,
  `src/features/create/api/spotForm.ts` (the form's rules, as one testable function),
  `src/features/create/api/mapCenter.ts` (the fallback centre),
  `src/shared/location/position.ts` (permission and position, with a refusal kept distinct from a
  silence), `src/shared/hooks/useIsOnline.ts` (reads the sync layer's connectivity seam rather than
  subscribing to NetInfo a second time).

  **No file under `src/features/create/` names a map library.** The picker consumes `@/shared/map`,
  which is still the app's only map-aware file — the property that keeps the post-beta MapLibre swap
  a one-file change, and which `__tests__/shared/map/vendorIsolation.test.ts` enforces.

- **Categories on a new spot**, as chips, using the same labels the Discover filter rail shows. The
  server takes free strings with no list to check against, so this is the app's own shortlist. The
  local row already had a `categories` column and the push already sent it, so nothing else changed.

### Changed

- **`MapCanvas` can hand a coordinate back.** (STOURIFY-4) Two optional props — `movablePinId` and
  `onMovePin` — make exactly one pin draggable and report where it was dropped as a plain app
  coordinate. The engine's own event object stops inside the wrapper, and a drag callback that
  arrives with no coordinate is ignored rather than forwarded: passing it on would move the spot to
  an undefined position, which reads downstream as a validation failure on a position the user never
  chose.

- **The new-spot form enforces the server's own limits before writing anything locally.**
  (STOURIFY-4) Title 3–255 characters, description up to 5,000, at most 10 categories of 40
  characters each — the rules in `SpotStoreRequest`, restated in `spotForm.ts`. This matters more on
  an offline-first app than it looks: a spot the server will refuse is written locally and pushed
  minutes later, so the rejection lands with nobody left watching to be told.

- **Block and report, reachable from the app.** (STOURIFY-37) The server has had both for a while —
  `sto_blocks` and `/api/v1/blocks` since STOURIFY-36, `/api/v1/reports` since M1 — and there was no
  way to reach either from a phone. Google Play does not publish a user-content app without them.

  Another explorer's profile now carries a `⋯` beside the Follow button, offering **Block** and
  **Report**. Block asks for confirmation first and says what it costs: the follows between the two
  accounts are deleted in both directions, and unblocking will not bring them back — that is the
  server's behaviour, stated plainly rather than discovered afterwards. A post carries the same `⋯`
  in the feed and on its own screen, offering Report.

  The report form is one component for every subject (`src/features/social/components/ReportSheet.tsx`).
  It enforces the server's own rule that a reason of "other" needs a description, so nobody waits for
  a round trip to be told a rule the app already knew. Filing the same report twice answers 200 with
  the row that already exists, and the sheet reads that as thank-you rather than as a failure.

  **Unblock lives under Settings → Blocked accounts, not on the blocked person's profile**, and the
  reason is worth knowing: once a block stands, `GET /profiles/{user}` answers 403 for the *blocker*
  as well, because a different answer for the two parties would announce the block. So that profile
  cannot be opened to un-block from. `GET /blocks` always can, which is what the new
  `BlockedAccountsScreen` reads. Unblock addresses the block row's uuid, never the user's.

  New: `src/shared/api/blocks.ts`, `src/shared/api/reports.ts`,
  `src/features/social/components/ReportSheet.tsx`,
  `src/features/social/components/PostActionsSheet.tsx`,
  `src/features/profile/screens/BlockedAccountsScreen.tsx`.
  Touched: `ProfileScreen`, `PostCard` (an optional `onMorePress`), `FeedScreen`,
  `PostDetailScreen`, `SettingsScreen`, `shared/navigation/types.ts`, `TabNavigator`.

- **`Sheet` and `SheetOption` primitives.** (STOURIFY-37) The Wander D4 kit had no modal surface at
  all, which is why `SettingsScreen`'s delete-account confirmation was hand-built in colour literals.
  Block, report and the overflow menus all needed one, so it is a primitive now: a dimmed backdrop
  that dismisses on tap, a rounded panel on `radius.sheet`, and rows that can act as menu items or as
  a radio group. Built on React Native's own `Modal` rather than a gesture library — a draggable
  sheet is a native module, and adding one would force a rebuild of the dev client and the APK for
  something no sheet here needs.

  `colors.scrim` is new in `src/theme/tokens.ts` and is the one value on this card **not**
  transcribed from the handoff: `styles.css` specifies a sheet radius and a sheet shadow but never
  the dim behind one. Derived from `ink`, documented in place as the line to correct if the handoff
  ever names it.

### Fixed

- **Nearby now calls a route that exists.** (STOURIFY-8) `getNearbyFeed` in `src/shared/api/feed.ts`
  called `GET /feed/nearby` — a route the server has never registered. Only `GET /spots/nearby` is,
  and nothing in the app called it, so `NearbyScreen` had rendered "No spots nearby" for its entire
  life against a swallowed 404. The client is `getNearbySpots` in `src/shared/api/spots.ts` now, and
  `getNearbyFeed` is gone rather than deprecated: an unused wrapper around a dead route is a trap
  with a friendly name.

  The parameter is `radius`, not `radius_km` — `SpotNearbyRequest` validates `lat`, `lng`, `radius`,
  `per_page`, `page`. This matters more than a rename usually does, because Laravel drops
  unvalidated query parameters silently: a misspelt radius does not fail, it quietly falls back to
  the server's 5 km default. `__tests__/shared/api/spots.test.ts` asserts the exact parameter set
  rather than a substring, so the next drift shows up as a red test instead of a wrong radius.

  Nearby renders **spots**, not feed posts — the shape genuinely changed rather than being coerced.
  Pins carry spot uuids, the strip and peek card are `SpotCard`s, and each shows its
  `distance_km` as "N.N km away". `distance_km` is present only on `/spots/nearby` responses, so a
  missing value renders nothing at all: absent means "not applicable" there, never zero.

  The strip's cards are `layout="wide"`. A `tall` card is a 160px image plus its text and the strip
  is capped at 200px, so the title and the distance fell below the fold — pins on the map with a
  blank list under them. Found on the emulator, not by reading the code.

  Distance ordering is the server's and is preserved as received, asserted end to end: the client
  test and `__tests__/screens/NearbyScreen.test.tsx` both fix a five-spot General Santos cluster at
  known separations and assert the whole sequence. A test that only checked for a non-empty array
  would pass under any permutation, which is not the criterion.

### Added

- **One map wrapper, and it is the only map-aware file.** (STOURIFY-7) `src/shared/map/MapCanvas.tsx`
  is now the single file in `src/` that names the map engine; everything else speaks the app's own
  vocabulary from `src/shared/map/types.ts` — pins with a semantic `kind`, a selected pin, a peek
  card, a recenter, and a region expressed as a centre plus a radius **in kilometres**. That last
  one is the load-bearing choice: degree deltas are one engine's private unit and have no MapLibre
  equivalent, so forwarding them would have made the wrapper an alias rather than a seam, and the
  post-beta swap to MapLibre (offline map packs) would still have meant editing every screen that
  draws a map. `NearbyScreen` consumes it and no longer imports the engine — it also now supports
  tapping a pin to peek at that post, and a recenter control. The boundary is enforced by
  `__tests__/shared/map/vendorIsolation.test.ts`, which walks `src/` and fails if a second file
  mentions the engine: `mobile/` ships no ESLint, and a convention nobody checks does not survive
  three milestones.

  The recenter control carries the safe-area top inset. The map draws edge to edge, so at a bare
  spacing offset the status bar covered all but about twenty pixels of a 44dp target — on the
  emulator it read as a dead button rather than as a layout bug, which is why the live gate found
  it and the unit tests had not. Asserted now, not just commented.

- **Settings now links to the Privacy Policy, the Terms of Service and a web account-deletion page**
  (STOURIFY-34). Google Play requires the first two to be reachable from inside the app, not only
  from the store listing, and requires a web-reachable deletion-request URL separate from the in-app
  path STOURIFY-32 shipped. A new LEGAL section on `SettingsScreen` carries all three.

  They sit **above** DANGER ZONE rather than inside it: reading a policy is not destructive, and the
  only irreversible action on that screen should be the one in the red section. The in-app
  "Delete account" flow is untouched — the web page is an addition, and a test asserts both are
  present, because Play requires both and losing either fails the listing.

  Opened with `Linking.openURL` from React Native rather than `expo-web-browser` or an in-app
  WebView. Both of those are native modules, so adding one would force a rebuild of the dev client
  **and** of the APK in order to ship what is, on our side, three links.

  The URLs come from the new `shared/config/legal.ts`, which derives the web origin from
  `EXPO_PUBLIC_API_URL` — already the single source of truth for which backend a build talks to —
  rather than hardcoding the production host. Hardcoding it would have made a dev build's Privacy
  Policy link open production, which is exactly the sort of thing nobody notices until the two
  documents disagree.

### Fixed

- **Map surfaces no longer kill the app process** (STOURIFY-21). The Android build carried no
  `com.google.android.geo.API_KEY`, so the Google Maps SDK threw `IllegalStateException: API key not
  found` on its own thread the instant a `MapView` mounted and dropped the app to the launcher — on
  `master` and on the STOURIFY-7 branch alike, which is what ruled out a code regression. The key now
  comes from `GOOGLE_MAPS_API_KEY` in `mobile/.env` and reaches the manifest without entering git:
  a new dynamic `app.config.js` feeds prebuild the Gradle placeholder token `${GOOGLE_MAPS_API_KEY}`
  (so the tracked `AndroidManifest.xml` holds only the token), and `android/app/build.gradle`
  substitutes the real value at build time from the environment, a `-P` property, or `.env`.
  `app.json` stays the source of truth for all static config — the resolved config gains
  `android.config.googleMaps.apiKey` and nothing else. Verified on `Pixel_9`: Discover → "Spots near
  me" draws Google tiles with no `FATAL EXCEPTION`. Provisioning, EAS-secret and key-restriction
  steps are in `docs/google-maps-api-key.md`.

### Changed

- **The native Android project is now what `expo prebuild` writes** (STOURIFY-21). Running the
  prebuild that injects the maps key also corrected drift the committed `android/` tree had
  accumulated: the manifest had none of `app.json`'s permissions and no `stourify` scheme intent
  filter, and the Kotlin namespace was still the scaffold's `com.mobile`. Both are now
  `app.stourify.mobile`; `applicationId`, and therefore the installed package and its signing, are
  unchanged. **The launcher activity is now `app.stourify.mobile.MainActivity`** — recipes that ran
  `am start -n app.stourify.mobile/com.mobile.MainActivity` need updating. A stale
  `android/build/generated/autolinking/` cache pins the old namespace and fails the build with
  `package com.mobile does not exist`; delete that directory if you hit it.

### Added

- **The author of a post is now a tap-target** (STOURIFY-35). Pressing the identity block on a feed
  row or on the post detail header opens that explorer's profile; pressing anywhere else on the card
  still opens the post. `Profile` is registered on the Home stack, which had no profile route at all
  — so every feed row named its author and led nowhere, which is exactly the broken loop the card
  was raised for. Inert when `PostResource.author` is absent (it is `whenLoaded('user')` and
  genuinely missing on some paths): no uuid, no tap-target, rather than a tap that throws.

- **Settings → Delete account, the in-app deletion path Play requires** (STOURIFY-32). A new row in
  the existing DANGER ZONE opens a confirmation sheet that collects the account's own email address
  and password, which is what `DELETE /api/v1/me` demands — a sheet rather than an `Alert` for
  exactly that reason, since an Alert cannot collect credentials. Two failure modes are handled
  deliberately rather than incidentally: an empty field is caught before the request, because
  otherwise it returns as a 422 that reads to the user like a wrong password; and a rejected
  deletion leaves the session completely intact, because signing out on failure would present a
  refused deletion as a successful one. On success the teardown goes through the existing
  `signOut()` — the one path that clears the local database, the sync cursor and the query cache —
  since by then the server has revoked every token and everything held locally describes an account
  that no longer exists. `src/shared/api/account.ts` is the new client.

### Fixed

- **The profile screen was reading an endpoint that cannot describe an explorer** (STOURIFY-35).
  It called `GET /users/{uuid}` — the boilerplate's platform-user route, which carries a name, an
  email and an avatar and nothing more. There is no username, bio, home city or follower count on
  it, which is why the counts rendered as a literal `–` and the header could never show an identity.
  It now reads `GET /profile` and `GET /profiles/{user}`, and renders the whole header: avatar,
  name, `@username`, bio, home city, interest chips and the server's computed counts. Three read
  outcomes each get their own render rather than a blank screen — a `null` own profile (registered
  but mid-onboarding), a 404 (no profile row), and a 403 (a block stands between the two parties,
  worded neutrally to match the server, which answers identically from either side by design).

- **Follow, unfollow and the follow lists were calling routes that have never existed**
  (STOURIFY-35). `src/shared/api/follows.ts` addressed a `/users/{uuid}/…` surface throughout; the
  real API is a single `follows` resource. Following is `POST /follows` with a `user_uuid`, and
  ending a relationship is `DELETE /follows/{followUuid}` — the *edge's* uuid, which the profile
  header's new `viewer` block now carries. `getUserPosts()` likewise moved from a non-existent
  `/users/{uuid}/posts` to `GET /posts?user_uuid=`, and the own-profile grid now passes `mine`
  instead of listing every visible post in the app under the signed-in explorer's name.

- **A timed-out account deletion no longer reports failure over an account that is already gone**
  (STOURIFY-32). Found by the live run, not by reasoning: the dev backend took **19 seconds** to
  complete the deletion and the API client gives up at 15, so the app showed "Could not delete your
  account" while the server had finished — leaving the user apparently signed in, holding a token
  that had just been revoked, so every retry answered 401. Two changes. `deleteAccount` now allows
  60 seconds, because deletion is the longest write the app makes: it revokes tokens and then
  withdraws every spot, post, review, wishlist item, follow edge and profile the account owns,
  writing a sync tombstone for each. And a response-less error is now treated as an **unknown**
  outcome rather than a failure — the app signs out. The asymmetry against a real rejection (wrong
  password, which definitely means the account survived, and correctly leaves the session alone) is
  the point: signing out after a timeout that changed nothing costs one login, while staying signed
  in after a timeout that deleted everything leaves an app that cannot recover.

- **Publish binds captured photos to the new spot — the M4 headline gate.** (STOURIFY-5) A spot
  and its photos are now one act. `publishSpot()` (`src/features/create/api/publishSpot.ts`) mints
  the spot's uuid, writes the `sto_spots` row and sets `host_uuid`/`host_type` on every queued
  `pending_media` row in **one** `database.batch`, entirely offline. The uuid is minted before the
  write because it is the row's identity, the key the server resolves the push by, and the
  `model_uuid` each photo's later `attach` resolves against (design spec §2.3 rule 1) — a
  server-allocated id would leave nothing to bind to until the spot had already reached a network,
  which is the one thing this flow does not have. One batch rather than two writes: a crash between
  them would publish a spot whose photos point at nothing, and the media drain skips an unbound row
  silently and forever, so that partial publish would never surface. An unbound row surviving
  publish throws — the card's rule that this is a bug, not a skip — as does a draft carrying more
  than the three-photo cap, which is a capture-time cap having failed rather than something to trim
  behind the user's back. **No gating was added anywhere**: publish touches neither the sync cycle
  nor `fullyAcked`, per design spec §2.3 rule 3, and the M4a regression test holding that line
  passes unmodified. `CreateSpotScreen` grew the review surface it needed — a live photo strip, an
  `n of 3` counter, an Add-photos route into capture that disables at the cap, and a Publish action
  — and capture's temporary entry point on the Create sheet is gone, since photos taken there could
  never bind to anything. `PhotoReviewScreen`'s Done now returns to the spot form rather than the
  Create menu, so the title and coordinates typed before the detour survive it.

- **Camera capture and a photo review step.** (STOURIFY-3) `CameraCaptureScreen` is the first
  `expo-camera` surface in the app — an in-app `CameraView` with an inline permission gate, a lens
  flip, and a gallery alternative that opens the picker's built-in native crop editor. Every result,
  captured or picked, goes through M4a's `queueLocalMedia`: the bytes are copied into app-private
  storage and a `pending_media` row is written **before** anything navigates. `PhotoReviewScreen`
  shows what has been captured, with retake and remove, and takes no route params at all — it reads
  the rows from WatermelonDB. That is the point rather than a detail: the only payload a route could
  carry is a camera URI into OS-owned cache that Android may reclaim, which is the difference
  between offline-capable and "works if you reconnect in time" (design spec §2.3 rule 4).
  Remove deletes the local file as well as the row, through the same `discardMediaRow` the Sync
  Status screen's Discard uses (§2.4), so a removed photo cannot leave a copy nothing will collect.
  Photos are queued **unbound** (`host_uuid = ''`) and are inert in the media drain until publish
  binds them to a spot — that wiring is STOURIFY-5. Capped at three photos, enforced at capture
  rather than discovered at publish. Filters remain cut. Reachable for now from a temporary "Add
  photos" entry on the Create sheet.

### Fixed

- **The media drain no longer duplicates a photo whose attach response was lost.** (STOURIFY-28)
  A device run published three photos and produced four `media` rows server-side. The card's
  hypothesis was a `destroyPermanently()` that silently failed; the evidence says otherwise. The
  surviving row read `state='pending'`, `attempts=0`, `last_error=NULL`, and exactly one branch in
  `drainPendingMedia` leaves an *attempted* row in that state — the `isMediaNetworkFailure` retry
  path. The row never reached its cleanup. The attach had committed on the server and only its
  reply was lost, which axios reports as a response-less error, identical in every observable way to
  a request that never left the device.

  So there was nothing local to clean up, and no cleanup change could have helped. The drain now
  sends `idempotencyKey: row.id` with every attach — the uuidv4 `queueLocalMedia` already mints as
  the `pending_media` row id, stable across every retry — and the server collapses repeats into one
  media row. **No schema migration:** the stable identity the fix needs already existed.

  The retry behaviour itself is deliberately unchanged. Giving up on a response-less attach would
  trade a duplicate photo for a lost one, which is the worse failure.

  `mediaDrain.test.ts` gains a regression test that reproduces the real mechanism — a lost attach
  response, retried on the next cycle — and asserts the two attempts carry different presigned keys
  but the same token, which is why the presigned key could never have served as the token itself.

- **`Spot.name` retired — the server has only ever sent `title`.** (STOURIFY-11) The `Spot` type had
  `name: string` **required** and `title?: string` optional, which is exactly backwards:
  `SpotResource::toArray()` sends `title` and has never sent a `name` key. A required field the
  server never sends types `undefined` as a `string`, so every consumer reading it compiled cleanly
  and rendered a blank. `name` is now removed outright rather than deprecated — an optional `name`
  would have kept the same reads compiling — and `title` is required.

  Three surfaces were rendering nothing as a result: the feed card's spot chip
  (`PostCard.tsx`), the compose screen's "Tag a Spot" row (`PostComposeScreen.tsx`), and every row
  of the spot picker (`SpotPickerScreen.tsx`, which had no test file at all, which is how blank rows
  survived a green suite). `SpotDetailScreen` was masked by its own `title ??` fallback and loses
  the dead leg.

  The card named `SearchScreen` and `NearbyScreen` as two of the four consumers; both had already
  been moved onto `title` by STOURIFY-9 and STOURIFY-18, and `SpotDetailScreen`/`SpotPickerScreen` —
  named nowhere on the card — were broken instead. `tsc --noEmit` is the test that proves the rename
  is complete: with `name` deleted, a missed call site is a compile error rather than a blank on a
  screen. `Spot.id` is still typed required and is also never sent — same defect class, filed
  separately rather than widened into this card.

- **Search never called the search endpoint.** (STOURIFY-9) `SearchScreen` queried `GET /spots` —
  the plain spot index — so the app had never once called `GET /discover/search`, the endpoint that
  searches spots, cities **and** people and that `ExplorerProfile` was made Scout-searchable for.
  The people and city indexes were unreachable from the app entirely, and spot hits skipped the
  discoverability rule the search controller applies. It now calls `/discover/search` and renders
  all three types as a sectioned list. `searchDiscover()` (the untyped grouped preview) and
  `searchDiscoverType()` (one paginated section) are two functions rather than one, because the
  route answers in two different shapes depending on whether `type` was sent, and a caller that has
  to interrogate the response to find out which it got will eventually get it wrong.

  Three smaller defects went with it. The **category chips did nothing** — six hardcoded strings
  (`Nature`, `Food`, `History`, …) with no server rule behind them, and no category entity to build
  one on; they are now the endpoint's real `type` selector (`All / Spots / Cities / People`), so
  every control on the screen does what its label says. A **one-character query was sent to the
  server**, which is required to answer `q|min:2` with a 422; nothing is sent below two characters
  now, and the screen prompts rather than claiming there were no results. And `Profile` is
  registered on the Discover stack, because a person row that renders but goes nowhere leaves the
  people index exactly as unreachable as it was.

  The screen was also moved onto Wander D4 tokens — it was 100% colour literals, the last screen in
  the Discover stack that was.

  Two things the emulator found that no unit test could. The chip rail rendered as full-height pills
  down the screen: a horizontal `ScrollView` with no height constraint stretches into whatever space
  the list below leaves it, and every test asserts on text rather than layout. And an in-flight
  search rendered nothing at all, which on a slow backend is indistinguishable from a search that
  found nothing — it now says `Searching…` with the term.

  Not in scope, deliberately: a `tags` result type. The gate criterion named one, but
  `SearchRequest::TYPES` is `['spots','cities','people']` and the module has a test asserting
  `?type=tags` is a 422 — tags are refused, not merely missing, and there is no indexed tag entity
  to search. Filed as STOURIFY-25.

- **Composing a post dropped every photo and never published it.** (STOURIFY-18) `PostComposeScreen`
  posted one multipart request carrying `media[0]`, `media[1]`, … and no `publish` flag.
  `PostStoreRequest` validates neither key, and Laravel discards unvalidated input without erroring —
  so every post ever composed with photos was created with none, and left permanently unpublished
  (`store()` sets `published_at` only when `publish` is truthy, and `Post::scopeVisibleTo()` and the
  feed both order by it). Two silent drops, no failure reported anywhere: the same failure mode as
  STOURIFY-2's on the same screen.

  The fix executes the contract the server already documents and routes: create the post unpublished,
  upload each photo through the platform's presign flow (`POST /media/upload-url` → PUT the bytes
  straight to storage → `POST /media/attach`, host `stourify_post`), then `POST /posts/{uuid}/publish`.
  New `src/features/social/api/uploadPostMedia.ts` owns those three steps — the same ones
  `sync/mediaDrain.ts` performs for the offline outbox — and `createPost` now sends JSON rather than
  multipart. Publish is deliberately last: a failed upload leaves a draft the idempotent `publish` can
  finish, rather than a live post missing half its photos.

  Rejected teaching `PostStoreRequest` to accept multipart: it would put image bytes back through the
  PHP request cycle the presign flow exists to avoid, and give the app two upload paths with different
  offline durability. Rejected routing post photos through the `pending_media` outbox: `drainPendingMedia`
  resolves its host in a local WatermelonDB table and `sto_posts` is not a synced table — posts are
  online-only, and making them offline-creatable is a feature rather than this bug's fix.

- **The feed rendered every post as text, never showing its photo.** (STOURIFY-18) `PostCard` carried a
  docblock asserting *"`PostResource` has no media key (confirmed against the resource, not assumed)"*
  and rendered no image on the strength of it. The resource does return `media` — an array of
  `{uuid, url, thumb_url}` — which is why `Post.media` had been typed all along. Found only at this
  card's live gate: the photo uploaded correctly, attached correctly, came back in `GET /feed` with a
  working CDN URL, and still appeared nowhere, because the one component that could show it had been
  told it did not exist. The card now renders the first attached photo, preferring `thumb_url` where
  the platform generated one. First photo only — a feed row is a summary, and the detail screen owns
  the rest.

- **The post composer was unreachable through the UI.** (STOURIFY-18) `MediaPicker` is the only route
  into `PostCompose` and nothing navigated to it, which is how the two defects above went unnoticed —
  and why they could not be live-verified. The Create sheet now carries a "New Post" entry.

- **"Location access needed" was shown to users who had granted location access.** (STOURIFY-20)
  `NearbyScreen` chained the permission request and the position request into one promise with a
  single `.catch`, so every failure — including a device that simply had no fix yet — rendered the
  permission-denial copy and sent the user to a setting that was already correct. There was no
  fallback and no way back: one slow fix ended the session on that screen. The boolean is replaced
  by an explicit state (`locating` / `ready` / `permission-denied` / `unavailable`), and a position
  failure now gets its own copy plus a "Try again" that re-runs the request in place. Before giving
  up, the screen falls back to `getLastKnownPositionAsync()`. That fallback is reached through a
  **timeout race**, not an error handler, which is the part that matters: the failure on record is
  `getCurrentPositionAsync` never settling at all — on an emulator whose fused provider is never
  driven it neither resolves nor rejects — so a `.catch` would never have fired.

- **Tagging a spot on a post had never worked.** (STOURIFY-2) `PostComposeScreen` posted
  `spot_name`, `spot_latitude` and `spot_longitude`; `PostStoreRequest` accepts only `spot_uuid`.
  Laravel drops unvalidated keys without erroring, so every tagged post was created with its spot
  association silently discarded — no failure surfaced anywhere. It now sends `spot_uuid` from the
  spot the picker already fetched. Behaviour is tag-an-existing-spot only: nothing in the app can
  produce a pending spot without a server-side uuid, and the create-then-tag flow belongs to the
  Create milestone.
- **`createSpot()` posted `name`, which the server has no rule for.** (STOURIFY-2)
  `SpotStoreRequest` requires `title`, so the first caller would have taken a 422 naming a field it
  never sent. Nothing called it yet — the defect was dormant, not absent. The parameter and the
  posted key are now `title`, and the request body is spelled out rather than forwarded, so the
  wire contract is what the test asserts.
- **A production APK pointed at the Android emulator loopback.** `eas.json` set
  `EXPO_PUBLIC_API_URL` only on the `development` profile, and `mobile/.env` is gitignored so it
  never reaches an EAS builder — a `preview` or `production` build therefore fell through to the
  hardcoded `http://10.0.2.2:8000/api/v1`, which resolves to nothing on a real phone. Every request
  would have failed: login, feed, sync. Both build profiles now set the live API URL explicitly, and
  the fallback in `client.ts` / `sync/httpClient.ts` is `__DEV__`-gated so a release binary can
  never silently use the emulator address.

### Added

- **M4a — the offline media pipeline.** Photos captured offline now survive an app kill and attach
  themselves to their host on reconnect. Before this, a picked photo existed only as an OS-owned
  cache URI held in navigation state: nothing persisted it, nothing queued it, and it was lost the
  moment the screen unmounted or Android reclaimed the cache. "Create a spot with 3 photos entirely
  offline" was not achievable at any layer.
  - `pending_media` — a **local-only** table (never in `SYNCED_TABLES`, never pushed as a row),
    added in **schema v2 through a WatermelonDB migration**, not a destructive reset: a reset would
    have discarded un-drained offline writes, which is exactly the data this project exists to
    protect. A test proves a v1 database with rows survives the migration.
  - `queueLocalMedia()` **copies the bytes** into app-private storage before recording the row. The
    picker URI is an OS cache entry the system may reclaim; the copy is the difference between
    "offline-capable" and "works if you reconnect fast enough".
  - `src/shared/api/media.ts` — the presign client the backend has had since M1 and the app had
    never called. The PUT goes through bare axios, never the shared client, so a presigned URL is
    not rejected for carrying an unexpected `Authorization` header.
  - `mediaDrain.ts` — **phase 2 of the sync cycle**, running after the pull. A pending row whose
    host is still dirty is skipped, because `attach` resolves the host by `model_uuid` and the row
    must exist server-side first. Presigning happens at drain time, never at capture time — the
    signed URL lives 15 minutes and one minted while offline is dead on arrival.
  - Pending photos get their own section in the M2c Sync Status screen, with Retry and Discard.
    **Discard deletes the local file as well as the row** — a discard that leaks bytes is a storage
    leak nothing would ever clean up.

  **The load-bearing decision: the media drain is deliberately OUTSIDE the skip-pull gate.** That
  gate exists because the pull applies deltas with unconditional server-wins and would silently
  destroy an unpushed *row edit*. A pending photo is not a row edit — no incoming delta can destroy
  it. Gating the pull on photo uploads would resurrect the exact indefinite stall M2c was built to
  escape, for a failure class that cannot lose data. A regression test asserts that a permanently
  failing upload leaves `fullyAcked` true and the pull still runs.

- **M3c Task 4 — Spot Hub: profile, gallery and reviews.** `SpotDetailScreen` rebuilt on the
  design system (was raw `StyleSheet`, hex literals, an empty grey `View` as the hero): a real hero
  from `media[0].url` with a design-system placeholder when a spot has no photos (never a bare grey
  box), the `Rating` primitive against `rating_average`/`reviews_count`, and category chips from the
  real `categories` array. Tapping the hero opens the new `PhotoGalleryScreen` — full-bleed swipeable
  images, a counter, a back affordance, and its own empty state.
  - **Save to wishlist is a genuine offline-first write**, not a React Query mutation:
    `createLocalWishlistItem` writes straight to WatermelonDB, same shape as `createLocalReview`
    (Task 3) — `sto_wishlist_items` is a synced, pushable table, so a save survives a bad connection
    and drains through the M2 queue. `useIsSpotSaved` observes it with `withChangesForTables`, not
    `observeWithColumns`, so the "Saved ↑" queued badge actually clears once the push acks (the same
    reasoning as `useMySpots`/`useSpotReviews`).
  - **New `ReviewsScreen`** merges the local, possibly-still-queued `sto_reviews` rows
    (`useSpotReviews`, Task 3) with the server list (`GET /reviews?spot_uuid=`), newest first, each
    row showing the reviewer's name from `ReviewResource`'s new nested `author` (Task 2) and a
    queued badge for un-drained local rows. "Helpful" votes are **online-only** — a reaction is not
    a synced table, so there is deliberately no offline path for it here.
  - **New `WriteReviewScreen`** — rating + body, local write only (`createLocalReview`, Task 3), no
    spinner and no network error path, since a local write cannot fail for network reasons. Saving
    navigates back immediately; the row appears in `ReviewsScreen` queued.
  - `PhotoGallery`, `Reviews` and `WriteReview` are registered wherever `SpotDetail` already is
    (Home, Discover, Profile stacks).
  - **Out of scope, per the milestone's pre-agreed cut list**: Contributors and Directions — not
    built, not stubbed.
  - `Spot.title`/`categories`/`media`/`rating_average`/`reviews_count` were added to the shared API
    type to match `SpotResource::toArray()`'s real field list. `Spot.name`/`category` stay required
    for the existing consumers that already depend on them (`PostCard`, `PostComposeScreen`,
    `SearchScreen`, `NearbyScreen`) — that mismatch (the server has never actually sent `name` or a
    singular `category`) predates this change and is out of scope here.
- **M3b — post-registration onboarding (4 screens).** `Onboarding` stack (`Permissions` →
  `Interests` → `HomeCity` → `FollowSuggestions`), wired into `RootStackParamList` and entered
  only after registration, never on every login — an AsyncStorage completion flag stops it from
  replaying.
  - `PermissionsScreen` asks for location only, with copy explaining why (nearby spots) before the
    OS prompt fires, and a visible Skip. `expo-notifications` is not installed and push is M5 work,
    so no notification permission is requested here.
  - `InterestsScreen` writes the chip selection to `ExplorerProfile.interests` through a local
    WatermelonDB write, the same path `CreateSpotScreen` uses — `sto_explorer_profiles` is a
    synced, pushable table, so the choice survives a bad connection and drains through the M2 queue
    rather than blocking on the network.
  - `HomeCityScreen` reads `sto_cities` from the local database, not the network — cities are
    pull-only reference data M2 already syncs, so the screen works offline by construction. A
    "still syncing" state covers the fresh-account case where the first delta has not landed yet.
  - `FollowSuggestionsScreen` is search-backed (`GET /discover/search`) with Follow buttons and a
    prominent Skip — see the scope decisions below; it is not a recommendations screen.
- **M3b — Activity reshaped to the follow-request inbox.** `ActivityScreen` (was a 25-line stub)
  now lists pending requests from `GET /api/v1/follows/requests` with Accept/Decline, and
  `Profile` is registered in `ActivityStackParamList` so a row can push a profile. See the scope
  decisions below.
- **M3b — Maestro e2e**: `.maestro/register-onboard-feed.yaml` drives register → onboard (skip
  every step) → feed, asserting on user-visible copy only. `npm run e2e`; see `docs/e2e.md`. Not
  run in this environment — see that doc's Prerequisites and the task report for the observed
  blockers.
- **M3b — themed `PostCard` and the feed path.** `ui/PostCard` replaces the legacy
  `shared/components/PostCard.tsx` (hardcoded palette, hand-rolled initials, and it read
  `post.user`/`post.media`, fields `PostResource` never sends) — built on `Card`/`Avatar`/`Tag`/`Text`
  against the real contract: a nested `author` object (`whenLoaded('user')`, genuinely absent on some
  paths — the card renders "Unknown" rather than crash) and `is_liked` for a filled heart.
  `FeedScreen` and `PostDetailScreen` are rebuilt on the design system; a new `CommentsScreen` lists a
  post's comments threaded client-side off `parent_id` (the endpoint does not eager-load `replies`),
  with an optimistic composer. `Comments` is registered in the Home stack.
- **The like action is wired**, on both the feed and post detail — `PostCard` always accepted
  `onLikePress`, but nothing ever passed it, so likes were read-only. Both mutations flip `is_liked`
  and `likes_count` in the React Query cache immediately and roll back on failure, so a like never
  waits on the network — the reason the persisted cache exists.
- `__tests__/screens/FeedScreen.test.tsx` asserts the offline criterion the way
  `queryPersistence.test.tsx` does: the feed renders posts from a seeded query cache while the
  fetcher throws.
- **M3a — auth entry flow.** Welcome, Forgot password and Reset password screens; Login and Register
  rebuilt on the Wander D4 design system behind a new `ui/Input` primitive. Register now reads
  `GET /auth/config` first, so the invitation-code field appears only when the server requires one
  and a closed registration is stated up front instead of failing on submit.
- **Persisted query cache.** `@tanstack/react-query-persist-client` over AsyncStorage, 24h max age,
  busted by app version. This — not the sync registry — is how the feed and other read surfaces
  render offline: the server's sync scope is per-user (`SyncRegistry::scope()`), and a feed is other
  people's rows under a follow-graph audience rule, which the delta contract cannot express. The
  backend states the same intent at `FeedApiController.php:33-39`.
- **Sync Status screen (M2c)** — `Settings → Offline & sync`, the app's offline honesty surface and
  the last open M2 exit criterion. It shows the real outbox queue read straight from the local
  database, every server rejection with the server's own error text, and per-row **Retry** /
  **Discard** plus **Retry all now**.

  **Discard is the load-bearing control.** A `validation` or `forbidden` rejection is excluded from
  every subsequent drain, and the skip-pull gate blocks the pull whenever anything is un-acked — so
  one permanently-invalid row stalls *all* incoming data indefinitely, with no error and no log
  line. Discard (`destroyPermanently`, never `markAsDeleted` — the server never accepted the row, so
  a delete push would only be rejected in turn and keep the gate shut) is the only escape.
  `__tests__/sync/discardUnblocksGate.integration.test.ts` proves the stall and the escape.

  Queue rows come from the database via `withChangesForTables`, **not** from
  `useSyncStatusStore.pendingCount` — that counter is only written inside a sync cycle, so a spot
  created in airplane mode would otherwise render as "All changes synced" over unsent writes. Cycle
  state (phase, offline, last-synced) still comes from the store, because only the cycle knows it.

- `src/sync/queue.ts` (read models, `retryRecord`, `discardRecord`, `retryAllFailures`),
  `src/sync/useSyncQueue.ts` (the live subscription), `src/features/sync/` (screen, banner, row) and
  `src/shared/utils/relativeTime.ts`.

### Removed

- **`Likes` cut from `HomeStackParamList` — no screen built.** Verified against
  `ReactionController::index`/`respondWith()`: `GET /api/v1/reactions` returns `{reacted, mine,
  counts}`, reaction *counts*, never the reacting users. Building a likes list would mean fabricating
  a user list from a count. Revisit if a reactions-listing endpoint is ever added.
- **Trail Stories shell — cut, not built.** It is a placeholder for Community, which is deferred
  past the beta, and item 3 on the milestone doc's own pre-agreed cut list. Building a shell for a
  deferred feature is the cheapest thing to not do.

### M3b scope decisions

Recorded here, with reasons, so a reviewer sees a decision rather than an omission:

1. **Trail Stories shell — cut.** See Removed above.
2. **Activity — reshaped to the follow-request inbox**, not a notifications feed. There is no
   activity/notifications API anywhere in the module or the boilerplate — no endpoint, no table,
   nothing to render. `GET /api/v1/follows/requests` (+ accept/decline) is what genuinely exists
   and is actionable. A real activity feed needs a server-side notifications subsystem, out of
   M3b's scope.
3. **Likes list — cut.** See Removed above; `GET /api/v1/reactions` returns counts, not the
   reacting users.
4. **Follow suggestions (onboarding) — search-backed, not recommendations.** There is no
   suggestions endpoint. `FollowSuggestionsScreen` offers people-search via `GET /discover/search`
   with a prominent Skip; it does not pretend to be a recommendation feed, which needs a
   server-side query this milestone does not build.

### Fixed

- **The comments client called routes that did not exist**, and the `Post`/`Comment` types
  described fields the server never returned. `GET|POST /api/v1/posts/{post}/comments` now exist
  module-side (uuid-addressed, mirroring every other Stourify route); `comments.ts` was already
  pointed at them and needed no route change. `Post` dropped the deprecated `user`/`media` fields
  (`PostResource` never sent either) and gained `is_published`, `published_at`, `updated_at` and
  `can`, mirroring `PostResource` exactly. `Comment` now mirrors `CommentResource` exactly
  (`visibility_type`, `commentable_type`/`commentable_id`, `replies`, `can`). `ProfileScreen`'s and
  `SpotDetailScreen`'s post-grid thumbnails read `item.media?.[0]`, a field that has never existed
  on the wire and so rendered nothing in production; both now render an honest placeholder tile
  instead of a silently-broken image.
- **The spot chip on `PostDetailScreen` was dead** — a `TouchableOpacity` with no `onPress`. It now
  navigates to `SpotDetail`.
- **Registering no longer leaves the sync session cold.** `RegisterScreen` never called `onLogin()`,
  which `LoginScreen` has always called — so a newly registered account had no primed local database
  and no sync cursor until its next sign-in.
- **No more Login flash on cold start.** `RootNavigator` rendered on a token that was still null for
  one frame while `loadFromStorage()` resolved. Navigation is now gated on rehydration behind a
  splash.
- Removed the dead `VerifyEmail` route: there is no `/api/v1` email-verification endpoint (the only
  verification routes are session/Inertia web routes), and verification is never enforced — `User`
  does not implement `MustVerifyEmail` and no API route carries `verified`.
- **The sync scheduler is now stopped on logout, before the database wipe.** It was started in
  `App.tsx` and only ever stopped on component unmount, which never runs on logout — so after a real
  logout the connectivity and AppState listeners stayed live and fired sync cycles against a wiped
  database with a cleared token, each one 401ing straight back into `signOut`. `scheduler.ts` had
  documented this requirement since M2b; nothing implemented it. The stop function now goes through
  `installSyncSessionHandlers` and runs as step 0 of `signOut`.

## [0.3.0] - 2026-07-29

### Fixed

- Corrected `syncStatus` getters on `Follow`, `Review`, `Spot`, `WishlistItem`, and
  `ExplorerProfile` WatermelonDB models: typed as the package's own `SyncStatus`
  (`@nozbe/watermelondb/Model`) instead of `string`, which illegally widened the base
  `Model.syncStatus` and produced `tsc` errors (plus cascading `TS2344` errors anywhere a
  model was used generically). Runtime behavior is unchanged.
- Scoped `tsconfig.json` (`include`/`exclude`, plus a `paths` remap of
  `@soxerp/offline-sync-core` to a new type-only `src/types/offline-sync-core.d.ts`) so
  mobile's `tsc` gate no longer type-checks `../packages/offline-sync-core`'s
  implementation, which cannot resolve its own `@nozbe/watermelondb` peer dependency
  (it has no `node_modules` of its own — that package owns its own `npm run typecheck`).
  Added `"node"` to `compilerOptions.types` so `global` (used by
  `__tests__/sync/httpClient.test.ts`) resolves, and fixed one pre-existing unsafe cast in
  that same test file. `npx tsc --noEmit` now exits 0; a clean `tsc` is now expected to
  stay green per task from here on.
- **`expo-font` realigned to the SDK 54 version** (`^57.0.1` → `~14.0.12`). It was pinned roughly
  forty major versions ahead of the SDK, so `FontLoaderModule` called a method that
  `expo-modules-core@3.0.29` does not have and the app died at Expo module registration with
  `java.lang.NoSuchMethodError: getDirectConverter` — before any JS ran. Pre-existing, unrelated to
  M2b, and undetected until now because M2b's native gate is the first time this app has ever been
  built and launched on a device rather than exercised under jest.

### Added

- **Offline-first sync layer (M2b).** A local WatermelonDB database plus the push/pull client for
  the frozen M2a contract.
  - `src/db/` — the schema for the six synced tables (columns straight from the server's
    `SyncSerializer` allowlist, plus `uuid`/`server_id` on every table) and the local-only
    `sync_failures` table; models with numeric-FK resolution by `server_id`, not `@relation`.
  - `src/sync/` — `syncConfig` (the client mirror of the server's `SyncRegistry`), a sync-only HTTP
    client with a timeout and the shared 401 path, engine wiring with a schema sanitizer,
    `pushService` (the drain), the cycle, the scheduler and the `status` store.
  - `src/sync/seams/` — `KeyValueStore`, `TokenStore` and `ConnectivityMonitor` over AsyncStorage,
    the auth store and NetInfo.
  - **The cycle is always drain → gate → pull, and the pull is SKIPPED whenever the drain leaves
    anything un-acked.** The engine applies a delta with unconditional server-wins and has no notion
    of a locally-dirty row, so a pull that races an unpushed edit destroys it silently. The cost is
    that one permanently-rejected row stalls incoming data until the user clears it — bounded
    staleness in exchange for zero data loss, and exactly what the M2c Sync Status screen exists to
    surface.
  - **The delta speaks ids; the push speaks uuids.** `pushService` translates each numeric FK back
    to the referenced row's uuid before serializing, because the server's FormRequests accept
    `city_uuid` / `spot_uuid` / `user_uuid` and never the integer FK. `applyPushResults()` writes
    the server-canonical `record` back and marks a row synced on `ok`; on `rejected` it upserts a
    `sync_failures` row — `validation`/`forbidden` excludes the row from the next drain, `error`
    bumps `attempts` and stays eligible for retry. `normalizeRejectionReason()` coerces any reason
    `SyncController::rejected()` emits outside `validation`/`forbidden`/`error` — i.e. `unsupported`
    and `conflict` — to `error` rather than dropping the op.
  - Create-a-spot vertical slice: `CreateSpotScreen` writes straight to WatermelonDB with **no
    loading state and no error state**, and an observed My Spots list renders `SpotCard`'s
    `Queued ↑` until the drain acks the row. The list subscribes through
    `withChangesForTables`, not `observeWithColumns`: neither observer re-emits on a `_status`
    flip, so the badge would never clear on a push ack.
  - Fixtures captured from the real M2a endpoints via `modules/Stourify/bruno/11-sync`, and a
    jest harness giving every test a fresh in-memory LokiJS database.

- **Wander D4 design system** in `src/theme/` — colour (light + dark), the Fraunces/Inter type
  scale, spacing, radii, elevation and motion, transcribed from the locked handoff at
  `docs/Project - Stourify/_ds/`. `ThemeProvider` follows the OS appearance; `useTheme()` is the
  only way screens reach a token.
- Fraunces and Inter loaded via `expo-font` + `@expo-google-fonts/*`. Rendering is not gated on
  the load — text falls back to the platform font for the first frame instead of blocking.
- **Primitive component set** in `src/shared/components/ui/`: `Text` (the type scale),
  `Button`, `Chip`, `Tag`, `Card`, `Avatar`, `Rating`, `Divider`, `Skeleton`, `EmptyState`,
  `SpotCard`.
- `useReducedMotion()` — React Native ships no such hook, so it wraps `AccessibilityInfo` and
  subscribes to changes. `Skeleton` stops pulsing when it is on.
- **Theme gallery** (`ProfileStack → ThemeGallery`) rendering every primitive in both palettes.
- Tests: token transcription guards, `ThemeProvider` scheme resolution, and primitive behaviour
  including touch-target size and the offline `Queued ↑` affordance. 34 tests total.
- `eas.json` with development / preview / production profiles.

### Changed

- `useAuthStore` now persists the signed-in `user` to AsyncStorage and restores it at boot; the
  token stays in SecureStore. A database keyed to an owner needs a stable identity before the first
  render, and nothing called `getMe()` early enough to provide one.
- Logout now wipes the local database and drops the sync cursor in addition to clearing the token,
  so the next account on the device inherits neither the previous user's rows nor a cursor that
  skips their backfill. Both HTTP clients route a 401 through this one path.
- `metro.config.js` watches the sibling `packages/` folder: `@soxerp/offline-sync-core` ships raw
  ESM TypeScript with no build step.

- **Navigation reworked to the deck's information architecture** — the five flat tabs
  (Feed · Nearby · Create · Search · Profile) become **Home · Discover · ⊕ Create · Activity ·
  Profile**, with Create a raised coral action in a custom `TabBar`. Search and Nearby move
  inside the Discover stack.
- `app.json` — real app identity: name `Stourify`, slug `stourify`, bundle id
  `app.stourify.mobile`, `userInterfaceStyle: automatic`, and the location/camera/photo
  permission strings the stores require.
- Screen prop types repointed to the new stacks (`HomeStackParamList`, `DiscoverStackParamList`).

### Notes

- **Out of scope (M2c):** the two Offline & Sync screens, retry-all, and the tier-2 user-visible
  conflict merge. `status.ts` gives those screens real data to render; it does not render it. M2b
  therefore does **not** satisfy the M2 exit criterion "Sync Status screen shows the real queue, a
  real conflict, and retry-all works".
- `X-Organization-Id` is deliberately not sent. `HttpClientOptions.getOrgId` exists for the day the
  single-organization assumption stops holding; the choice is documented at the client.
- Placeholder screens stand in for Discover, Activity and the Create menu. The real screens
  arrive in M3–M4 (`docs/mobile-delivery/milestones.md`).
- **Not yet done in M0:** Sentry and analytics wiring (needs a DSN and project), and the on-device
  verification of the gallery and a dev build.
