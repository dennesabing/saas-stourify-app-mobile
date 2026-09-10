import type { LinkingOptions } from '@react-navigation/native'
import type { RootStackParamList } from './types'

/**
 * Which `stourify://` URL means which screen.
 *
 * Think of the Android manifest's intent filter as a working front-door buzzer
 * and this file as the list of room numbers behind it. Without the list the
 * door opens and the visitor stands in the corridor: the link reaches the app
 * and lands nowhere. That was the state of things until STOURIFY-253 — the
 * `VIEW` intent filter for `android:scheme="stourify"` has always been in
 * `android/app/src/main/AndroidManifest.xml`, and `NavigationContainer` was
 * mounted with no `linking` prop at all.
 *
 * Why it matters beyond tidiness: a spot could only ever be opened by tapping
 * a row in Discover or in Search. Both of those lists ask the server for their
 * contents, so on a device whose account the server refuses — which is exactly
 * the test emulator's situation — the spot screens were unreachable by any
 * route whatsoever, and three cards' worth of live runs had nothing to look at.
 * A URL is a way in that does not depend on a list loading first.
 *
 * `stourify://spot/<uuid>`                 → the Spot Hub
 * `stourify://spot/<uuid>?tab=about`       → the Spot Hub, opened on About
 * `stourify://spot/<uuid>/photos`          → the photo gallery
 * `stourify://spot/<uuid>/reviews`         → the reviews list
 *
 * Scope, deliberately: the spot family and nothing else. Posts, profiles and
 * tags are one line each to add when something needs them; adding them now
 * would be untested surface.
 */

/**
 * The prefix is written out rather than derived from `expo-linking`, because
 * that package is not a dependency of this app and adding one to spell a
 * constant that already appears in `app.json` and in the manifest would be a
 * poor trade. If a second scheme is ever added, both live here.
 */
const PREFIXES = ['stourify://']

/** `?tab=about` is what a human types; `'About'` is what the screen's state is. */
function parseTab(value: string): 'Posts' | 'About' {
  return value.toLowerCase() === 'about' ? 'About' : 'Posts'
}

function stringifyTab(value: 'Posts' | 'About'): string {
  return value.toLowerCase()
}

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: PREFIXES,
  config: {
    screens: {
      /*
       * Everything hangs off `MainTabs`, which is mounted only when there is a
       * token. That is the whole of the signed-out story: with no session the
       * screens below do not exist, React Navigation finds nothing to match,
       * and the app shows Welcome exactly as it does on any other cold start.
       * No special case is needed and none is written.
       */
      MainTabs: {
        screens: {
          /*
           * The spot screens are registered on the Home, Discover and Profile
           * stacks alike. Discover is the one chosen here because a spot
           * arrived at from a link is a discovery, and `initialRouteName`
           * below means pressing Back from a deep-linked screen lands on the
           * Discover page rather than on an empty stack with nowhere to go.
           */
          DiscoverTab: {
            initialRouteName: 'Discover',
            screens: {
              SpotDetail: {
                path: 'spot/:spotId',
                parse: { tab: parseTab },
                stringify: { tab: stringifyTab },
              },
              PhotoGallery: 'spot/:spotId/photos',
              Reviews: 'spot/:spotId/reviews',
            },
          },
        },
      },
    },
  },
}

export default linking
