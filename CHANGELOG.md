# Changelog

All notable changes to the Stourify mobile app are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
