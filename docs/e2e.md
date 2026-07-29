# Running the end-to-end flow

For: anyone verifying the register → onboard → feed path on a device or emulator, not exercising
individual screens (that's `npm test`).

## What it covers

`.maestro/register-onboard-feed.yaml` — one flow, driven by [Maestro](https://maestro.mobile.dev):
registers a brand-new account, walks it through onboarding (Permissions, Interests, Home city,
Follow suggestions — skipping every optional step), and asserts it lands on the feed. Assertions
are on user-visible copy (e.g. "Find spots near you", "Your feed is empty"), not testIDs of
intermediate screens, so a screen rename does not break the flow.

A brand-new account follows no one, so the feed's own empty state ("Your feed is empty",
`FeedScreen.tsx`) is what the flow asserts to prove the feed was reached — it is the real
production copy for that case, not a flow-only stand-in.

The registration email is unique per run (`${'maestro-' + Date.now() + '@stourify.test'}`), since
the backend 422s a duplicate email and the flow does not handle that case.

## Prerequisites

- [Maestro CLI](https://maestro.mobile.dev/getting-started/installing-maestro) installed and on
  `PATH` (`maestro --version`).
- An Android emulator running (`emulator -list-avds` to see what's provisioned, `adb devices` to
  see what's already up — Maestro attaches to whatever's running, so start one first if none is).
- A **dev-client build installed on that emulator** — this flow drives the app itself, not Expo Go.
  Any native dependency change (WatermelonDB, expo-location, etc.) requires a fresh
  `npm run android` (`expo run:android`) before the flow can run against current source; a stale
  dev-client APK missing a native module added since it was built will not run.
- Metro running (`npm start`) so the dev client has JS to load, unless the build embeds the bundle.
- A reachable backend. The flow points at whatever `EXPO_PUBLIC_API_URL` the dev-client build was
  made against (`src/shared/api/client.ts` falls back to `http://10.0.2.2:8000/api/v1` — the
  emulator's loopback to the host's `localhost:8000` — when unset), so the Laravel app must be
  running there and reachable from the emulator before running the flow.

## Running it

```bash
npm run e2e
# equivalent to: maestro test .maestro/register-onboard-feed.yaml
```

Maestro attaches to whichever device `adb devices` reports; if more than one is attached, pass
`--device <id>` (`maestro test --device emulator-5556 .maestro/register-onboard-feed.yaml`).
