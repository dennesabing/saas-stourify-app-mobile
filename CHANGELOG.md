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

### Added

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

- **Navigation reworked to the deck's information architecture** — the five flat tabs
  (Feed · Nearby · Create · Search · Profile) become **Home · Discover · ⊕ Create · Activity ·
  Profile**, with Create a raised coral action in a custom `TabBar`. Search and Nearby move
  inside the Discover stack.
- `app.json` — real app identity: name `Stourify`, slug `stourify`, bundle id
  `app.stourify.mobile`, `userInterfaceStyle: automatic`, and the location/camera/photo
  permission strings the stores require.
- Screen prop types repointed to the new stacks (`HomeStackParamList`, `DiscoverStackParamList`).

### Notes

- Placeholder screens stand in for Discover, Activity and the Create menu. The real screens
  arrive in M3–M4 (`docs/mobile-delivery/milestones.md`).
- **Not yet done in M0:** Sentry and analytics wiring (needs a DSN and project), and the on-device
  verification of the gallery and a dev build.
