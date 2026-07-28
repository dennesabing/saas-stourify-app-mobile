# Changelog

All notable changes to the Stourify mobile app are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
