import { useEffect, useRef } from 'react'

/**
 * The minimum a screen needs for this: the ability to be told it came back.
 *
 * Typed structurally rather than as a navigation prop so a test can pass a
 * plain object, and so this file does not care which navigator a screen is in.
 */
interface FocusAware {
  addListener?: (event: 'focus', callback: () => void) => (() => void) | void
}

/**
 * Ask again when the screen comes back into view.
 *
 * ## Why this is needed at all
 *
 * React Navigation keeps a screen MOUNTED when you navigate away from it. Come
 * back and the component does not re-run: no mount, so no fetch, so the screen
 * shows whatever it was showing when you left — however long ago that was, and
 * whatever has happened since.
 *
 * That is invisible until the thing that changed is something the reader did
 * themselves. Add a spot, open the nearby list you looked at ten minutes ago,
 * and it says there is nothing here — while a pin for that very spot sits on
 * the map above it (STOURIFY-200). The list is not broken and the request did
 * not fail; the screen was simply never asked again.
 *
 * `staleTime: 0` does not save us. It marks data stale immediately, and React
 * Query acts on that **on mount** — which is the event that never happens.
 *
 * ## Why the navigation prop rather than `useFocusEffect`
 *
 * Nothing in this app's `src/` looks navigation up; every screen is handed it
 * as a prop. `SpotAboutTab` explains the other half of the reason: the test
 * harness mounts screens with no navigation container, so a context hook throws
 * in every test that renders one. A prop is passed a mock and works.
 *
 * `addListener` is optional and a missing one is not an error — a screen
 * rendered outside a navigator simply keeps its mount-time fetch, which is the
 * correct behaviour rather than a degraded one.
 *
 * ## The first focus is deliberately skipped
 *
 * A screen's first focus arrives with its mount, and the query is already
 * fetching. Refetching there would double every screen's opening request for no
 * new information.
 */
export function useRefetchOnFocus(navigation: FocusAware, refetch: () => void): void {
  // Held in a ref so a new `refetch` identity on every render does not tear the
  // subscription down and build it up again.
  const latest = useRef(refetch)
  latest.current = refetch

  const isFirstFocus = useRef(true)

  useEffect(() => {
    if (typeof navigation?.addListener !== 'function') return

    const unsubscribe = navigation.addListener('focus', () => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false
        return
      }

      latest.current()
    })

    return typeof unsubscribe === 'function' ? unsubscribe : undefined
  }, [navigation])
}
