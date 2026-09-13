# What About and Report content leave out

This page is for anyone changing the About page or the report sheet, or checking them against
`docs/design/Stourify - Settings.dc.html` (artboards 8 and 5). It covers what the design draws that
the app doesn't build, and the few facts you need before you touch either screen (STOURIFY-291).

A shop window that shows a coat the shop doesn't sell is worse than an empty hook. Both screens
follow that rule. Anything the design draws that has nothing behind it stays out until something
does.

## About (artboard 8)

`src/features/profile/screens/AboutScreen.tsx`, reached from Settings → Legal → About Stourify.

| Drawn on the canvas | Built? | Why |
|---|---|---|
| Mark, wordmark, version, mission, "Made with care in General Santos City." | Yes | — |
| © line | Yes, as "© <this year> Stourify · All rights reserved." | The canvas says "Stourify Inc."; no company by that name is on record, so the app doesn't claim one. |
| "Rate Stourify" button | No | There is no public store listing to send anyone to (STOURIFY-79). |
| Social links | No | The design names no accounts, and the project has none. |
| "Photography via Unsplash contributors" | No | The app ships no Unsplash photos. That credit belongs to the design canvases. |

### Where the version comes from

`src/shared/config/installedBuild.ts` reads `Constants.expoConfig.version` and
`.android.versionCode` from `expo-constants`. That is the app config baked in when the build was
made, and Expo generates it from `mobile/app.json`.

Android's own App info screen reads a different file, `android/app/build.gradle`
(`versionName` / `versionCode`). **The two agree only while a release bumps both.** If About and App
info ever disagree, check those two files before suspecting the screen.

This is deliberately not the build-identity line at the bottom of Settings
(`src/shared/config/buildIdentity.ts`). That one describes the JavaScript that is running, for the
test rig. This one describes the build a person installed, for them. `expo-application` would read
the native package directly, but it is a native module and would mean a rebuilt APK for one line of
text.

## Report content (artboard 5)

`src/features/social/components/ReportSheet.tsx`, opened from ⋯ on a post (`PostActionsSheet`) and
on someone else's profile (`ProfileScreen`).

- **It is still a sheet.** The canvas draws a full screen. Both callers open the report from a
  sheet, so a full screen would change the flow for every one of them. The design's content fits:
  reasons, details, and a confirmation.
- **The reasons are the server's.** `ReportReason` has the same five as the design. Only the
  wording a person reads changed ("Inappropriate or offensive", "Wrong or outdated info"). The
  values sent (`spam`, `inappropriate`, `wrong_info`, `harassment`, `other`) did not.
- **"Your report is anonymous." has to stay true.** It holds because `ReportPolicy` lets only
  moderators view reports, and `ReportResource` sends `reporter_uuid` only to moderators and to the
  reporter. If either of those changes so that the reported person can learn who reported them,
  delete the sentence.
- **"Something else" still needs details.** The server requires them (`ReportStoreRequest`), so the
  field's label switches to "(required)" and the sheet refuses locally rather than showing a 422.
- **Nothing a report sends changed.** The request, its payload and its error handling are the same.
  `__tests__/features/social/ReportSheet.test.tsx` pins the payloads.
