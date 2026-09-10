import { act, render, screen } from '@testing-library/react-native'
import type { RefObject } from 'react'
import { useRef } from 'react'
import { DeviceEventEmitter, Text, type View } from 'react-native'
import { useKeyboardOverlap } from '@/shared/components/ui'

/**
 * STOURIFY-257. `useKeyboardOverlap` reasons in absolute screen coordinates
 * rather than trusting `KeyboardAvoidingView`'s parent-relative `onLayout`
 * frame (see the hook's own doc comment for why). These tests stand in for
 * `.measure()`'s `pageY` with a fake ref — the exact wrapper position is the
 * whole point, and a fake makes it a plain number instead of something read
 * off a real device tree.
 *
 * Fired as `keyboardWillShow`/`keyboardWillHide` — Jest's RN preset defaults
 * `Platform.OS` to `'ios'` (`react-native/jest-preset.js` → `haste.defaultPlatform`),
 * and that is the pair the hook listens for there.
 */

function fakeRef(bottomInWindow: number): RefObject<View | null> {
  return {
    current: {
      measure: (
        callback: (
          x: number,
          y: number,
          width: number,
          height: number,
          pageX: number,
          pageY: number,
        ) => void,
      ) => {
        // Split arbitrarily between pageY and height — only their sum matters
        // to the hook.
        callback(0, 0, 0, 100, 0, bottomInWindow - 100)
      },
    } as unknown as View,
  }
}

/** A one-line host so the hook's return value shows up somewhere `screen` can read. */
function Probe({ wrapperBottom }: { wrapperBottom: number }) {
  const ref = useRef(fakeRef(wrapperBottom).current)
  const overlap = useKeyboardOverlap(ref)
  return <Text testID="overlap">{overlap}</Text>
}

function currentOverlap(): string {
  return screen.getByTestId('overlap').props.children
}

test('starts at 0 with the keyboard closed', () => {
  render(<Probe wrapperBottom={800} />)

  expect(currentOverlap()).toBe(0)
})

test('a wrapper that reaches the bottom of the screen overlaps by the full keyboard height', () => {
  // The ordinary case: nothing below the wrapper, so the whole keyboard is a
  // wrapper it did not have before.
  render(<Probe wrapperBottom={800} />)

  act(() => {
    DeviceEventEmitter.emit('keyboardWillShow', {
      duration: 0,
      easing: 'keyboard',
      endCoordinates: { screenX: 0, screenY: 500, width: 400, height: 300 },
    })
  })

  expect(currentOverlap()).toBe(300)
})

test('a wrapper that ends above the bottom of the screen overlaps by less than the keyboard height (the tab-bar case)', () => {
  // STOURIFY-257: a screen whose wrapper stops short of the screen's bottom —
  // a tab bar sitting behind where the keyboard rises from — must not be
  // pushed up by the tab bar's own height on top of the keyboard's.
  render(<Probe wrapperBottom={720} />)

  act(() => {
    DeviceEventEmitter.emit('keyboardWillShow', {
      duration: 0,
      easing: 'keyboard',
      endCoordinates: { screenX: 0, screenY: 500, width: 400, height: 300 },
    })
  })

  // The wrapper's bottom edge (720) is already 80dp above the keyboard's top
  // (500 + 300 = 800), so only 720 - 500 = 220 of it is actually covered.
  expect(currentOverlap()).toBe(220)
})

test('a wrapper that already clears the keyboard has no overlap at all', () => {
  render(<Probe wrapperBottom={450} />)

  act(() => {
    DeviceEventEmitter.emit('keyboardWillShow', {
      duration: 0,
      easing: 'keyboard',
      endCoordinates: { screenX: 0, screenY: 500, width: 400, height: 300 },
    })
  })

  expect(currentOverlap()).toBe(0)
})

test('drops back to 0 once the keyboard closes', () => {
  render(<Probe wrapperBottom={800} />)

  act(() => {
    DeviceEventEmitter.emit('keyboardWillShow', {
      duration: 0,
      easing: 'keyboard',
      endCoordinates: { screenX: 0, screenY: 500, width: 400, height: 300 },
    })
  })
  act(() => {
    DeviceEventEmitter.emit('keyboardWillHide', {
      duration: 0,
      easing: 'keyboard',
      endCoordinates: { screenX: 0, screenY: 800, width: 400, height: 0 },
    })
  })

  expect(currentOverlap()).toBe(0)
})
