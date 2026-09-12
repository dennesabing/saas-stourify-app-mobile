# Choosing light or dark: how Settings → Appearance works

For anyone changing the app's theme, its launch sequence or its Settings screen. It explains what
the Appearance choice does, where it is kept, and the one part of the screen it cannot reach, so you
can change any of them without breaking the others. Added under STOURIFY-290.

## What the person using the app sees

Settings → Preferences → **Appearance** offers three choices:

| Choice | What it does |
|---|---|
| **System** (the default) | Follows the phone. Switch the phone to dark in Android's quick settings and the app follows, even while it is open. |
| **Light** | Always light, whatever the phone says. |
| **Dark** | Always dark, whatever the phone says. |

The choice applies the moment you tap it, with no restart, and it is still there the next time the
app opens. A fresh install is on System, so anybody who never opens Settings sees exactly what they
saw before this existed.

## How it works

Think of a house with a light sensor on the porch that decides whether every room is lit. Appearance
adds a switch by the front door that can override the sensor. The switch has to reach two different
sets of wiring: the rooms the app paints itself, and the fittings Android owns.

**The rooms the app paints: `ThemeProvider`.** Every screen gets its colours from
`src/theme/ThemeProvider.tsx`. It decides the palette in this order:

1. a `scheme` passed in directly: the theme gallery and tests, never the running app;
2. the Appearance choice, when it is Light or Dark;
3. on System, `useColorScheme()`, which is the phone's setting.

Because the provider reads the choice itself, every screen repaints the instant the choice changes.

**The fittings Android owns: `Appearance.setColorScheme()`.** System alert dialogs and the parts of
the screen Android draws are not painted by the app, so the provider cannot reach them.
`src/theme/appearance.ts` calls React Native's `Appearance.setColorScheme()` whenever the choice is
loaded or changed: `'light'` or `'dark'` to pin it, or `null` for System. On React Native 0.81 that
reaches Android's own app-wide night-mode switch:

- `Libraries/Utilities/Appearance.js` passes `null` on as `'unspecified'`;
- Android's `AppearanceModule.kt` turns `'light'`, `'dark'` and `'unspecified'` into
  `AppCompatDelegate.MODE_NIGHT_NO`, `MODE_NIGHT_YES` and `MODE_NIGHT_FOLLOW_SYSTEM`;
- the app's native theme is `Theme.AppCompat.DayNight` (`android/app/src/main/res/values/styles.xml`),
  so dialogs follow that switch;
- `MainActivity` lists `uiMode` in `android:configChanges` (`AndroidManifest.xml`), so the switch
  does not restart the screen. Android reports a configuration change instead, and React Native
  passes it on as an `appearanceChanged` event.

If you upgrade React Native, read those two source files again: the mapping is theirs, not ours.

**The status bar.** `App.tsx` draws the status bar for the theme's scheme, not with
`style="auto"`. `auto` follows the phone, which would put white icons on a white page whenever the
app is pinned to Light on a dark phone.

## Where the choice is kept

It is saved in AsyncStorage under `stourify_appearance`, as `system`, `light` or `dark`. It stays on
the phone and is never sent to the server, because appearance belongs to the device in your hand,
like its screen brightness. That also means an offline launch has the right colours. A value the app
does not recognise, or a read that fails, counts as System.

## Why the first screen is never the wrong colour

`RootNavigator` holds its splash until three things have been read: the saved sign-in token, the
onboarding flag, and the saved appearance. Only then does it draw the first real screen, so that
screen is already in the chosen colours. Remove the appearance from that `Promise.all` and an app set
to Light on a dark phone draws its first screen dark and then flips. The test that guards this is
`__tests__/navigation/appearanceGate.test.tsx`: it records every scheme the first screen is drawn
in, so a single wrong frame fails it.

## The one thing it cannot reach

For a moment on a cold start, before any of the app's JavaScript runs, Android shows the app's
native launch screen. That screen is **always white**: `android/app/src/main/res/values/colors.xml`
sets `splashscreen_background` to `#FFFFFF`, and there is no dark version. It follows neither the
phone nor the saved choice.

What that means in practice, measured on an emulator under STOURIFY-290:

- **Light on a dark phone:** white launch screen, then light screens. No flash.
- **Dark, on any phone:** white launch screen, then dark screens. A white flash, lasting about 1–4
  seconds on the debug build (most of it spent fetching the code from the bundler). This already
  happened for everybody whose phone is dark before Appearance existed.

Fixing it needs native work and a new build: a `values-night` colour for a dark phone, and code in
`MainActivity` that reads the saved choice before the window is drawn, for Dark on a light phone.
STOURIFY-304 tracks it. STOURIFY-290 deliberately added no native code.

## Testing it

- Under jest there is no native Appearance module. Tests that need to see what the app asks Android
  for replace `react-native/Libraries/Utilities/Appearance` with a stand-in and assert on
  `setColorScheme`. Tests that need to fake the phone's setting replace
  `react-native/Libraries/Utilities/useColorScheme`. Both are in `__tests__/theme/`.
- On an emulator, set the phone dark with `adb shell cmd uimode night yes`, choose Light in the app,
  and check that the screen, a system dialog and the status bar all turn light at once.
