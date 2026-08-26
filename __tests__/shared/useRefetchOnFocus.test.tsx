import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'

/**
 * STOURIFY-200 — the nearby list said "No spots nearby" for a spot the reader
 * had just added, while its pin sat on the map above.
 *
 * The cause was not the list and not the request. React Navigation keeps a
 * screen MOUNTED when you navigate away, so coming back re-runs nothing: the
 * screen shows the answer it got the last time it was opened. `staleTime: 0`
 * does not help, because React Query acts on staleness at MOUNT, and that is
 * the event that never happens.
 */
function Probe({ navigation, refetch }: { navigation: any; refetch: () => void }) {
  useRefetchOnFocus(navigation, refetch)
  return <Text>probe</Text>
}

/** A stand-in for the navigation prop, capturing the focus subscriber. */
function fakeNavigation() {
  let listener: (() => void) | null = null
  const unsubscribe = jest.fn()

  return {
    nav: {
      addListener: jest.fn((event: string, cb: () => void) => {
        if (event === 'focus') listener = cb
        return unsubscribe
      }),
    },
    focus: () => listener?.(),
    unsubscribe,
  }
}

it('refetches when the screen comes back into view', () => {
  const refetch = jest.fn()
  const { nav, focus } = fakeNavigation()

  render(<Probe navigation={nav} refetch={refetch} />)

  focus() // the first focus arrives with the mount
  expect(refetch).not.toHaveBeenCalled()

  focus() // a genuine return to the screen
  expect(refetch).toHaveBeenCalledTimes(1)
})

/**
 * The first focus is the mount, and the query is already fetching. Refetching
 * there would double every screen's opening request for no new information.
 */
it('does not refetch on the focus that arrives with the mount', () => {
  const refetch = jest.fn()
  const { nav, focus } = fakeNavigation()

  render(<Probe navigation={nav} refetch={refetch} />)
  focus()

  expect(refetch).not.toHaveBeenCalled()
})

it('calls the latest refetch, not the one captured when it subscribed', () => {
  const first = jest.fn()
  const second = jest.fn()
  const { nav, focus } = fakeNavigation()

  const { rerender } = render(<Probe navigation={nav} refetch={first} />)
  focus()
  rerender(<Probe navigation={nav} refetch={second} />)
  focus()

  // A screen re-renders constantly and `refetch` gets a new identity each time.
  // Holding the first one would quietly refetch a stale closure forever.
  expect(second).toHaveBeenCalledTimes(1)
  expect(first).not.toHaveBeenCalled()
})

it('subscribes once, not on every render', () => {
  const { nav, focus } = fakeNavigation()
  const { rerender } = render(<Probe navigation={nav} refetch={jest.fn()} />)

  rerender(<Probe navigation={nav} refetch={jest.fn()} />)
  rerender(<Probe navigation={nav} refetch={jest.fn()} />)
  focus()

  expect(nav.addListener).toHaveBeenCalledTimes(1)
})

it('unsubscribes when the screen goes away', () => {
  const { nav, unsubscribe } = fakeNavigation()
  const { unmount } = render(<Probe navigation={nav} refetch={jest.fn()} />)

  unmount()

  expect(unsubscribe).toHaveBeenCalled()
})

/**
 * A screen rendered outside a navigator keeps its mount-time fetch. That is the
 * correct behaviour rather than a degraded one — and it is what lets every
 * existing screen test, which has no navigation container, keep working.
 */
it('does nothing, and does not throw, without a navigator', () => {
  const refetch = jest.fn()

  expect(() => render(<Probe navigation={{}} refetch={refetch} />)).not.toThrow()
  expect(refetch).not.toHaveBeenCalled()
})
