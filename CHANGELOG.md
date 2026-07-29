# Changelog

All notable changes to the Stourify mobile app are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
