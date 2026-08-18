# Changelog

All notable changes to the Stourify mobile app are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
