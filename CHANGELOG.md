# Changelog

All notable changes to the Stourify mobile app are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

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
