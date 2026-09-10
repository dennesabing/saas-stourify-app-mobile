import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { Keyboard, LayoutAnimation, Platform, type View } from 'react-native'

/**
 * How much of a pinned footer's wrapper the on-screen keyboard currently
 * covers, in dp — 0 when the keyboard is closed. Give it straight to a
 * `paddingBottom` (or add it to one) and the footer sits right on top of the
 * keyboard, whatever else is on the screen.
 *
 * `KeyboardAvoidingView` works this out from its own on-screen position,
 * captured once via `onLayout` (relative to its parent) and compared against
 * the keyboard's position. Two ways that can go wrong, both seen on
 * STOURIFY-257:
 *
 * - The parent-relative frame is only as trustworthy as the parent chain
 *   above it staying put — a screen sitting inside a modal stack inside a tab
 *   navigator is exactly the kind of nesting that can shift it.
 * - Handing it the keyboard's raw height over-corrects if the wrapper's own
 *   bottom edge sits above the bottom of the screen — the tab bar, in this
 *   app's case. The footer lifts by the keyboard's full height, floating it
 *   clear of the keyboard by however much screen sits below the wrapper,
 *   instead of resting on it.
 *
 * This hook sidesteps both: it measures the wrapper's bottom edge in absolute
 * screen coordinates and compares it against the keyboard's own screen
 * coordinate (`endCoordinates.screenY` — despite the name, this is a Y
 * position, not a screen). Same coordinate space on both sides, so nothing
 * about the parent chain or what sits below the wrapper needs to be right for
 * the subtraction to be right.
 *
 * That absolute position comes from `.measure()`'s `pageY`, not
 * `measureInWindow` — on this app's screen (a modal inside a tab navigator,
 * on Fabric) `measureInWindow` under-reports `y` by a fixed, wrong offset,
 * while `.measure()`'s `pageY` agrees with `onLayout`'s own relative frame
 * once you walk it up to an absolute position. Confirmed on-device rather
 * than assumed: swap it back only after checking the two agree again.
 */
export function useKeyboardOverlap(wrapperRef: RefObject<View | null>): number {
  const [overlap, setOverlap] = useState(0)
  // Kept outside state: the keyboard's position only changes on show/hide,
  // but a re-measure of the wrapper (STOURIFY-257: e.g. once its own layout
  // pass settles) should reuse whatever the keyboard last reported.
  const keyboardScreenY = useRef<number | null>(null)

  const measure = useCallback(() => {
    const keyboardY = keyboardScreenY.current
    const node = wrapperRef.current
    if (keyboardY == null || node == null) return

    node.measure((_x, _y, _width, height, _pageX, pageY) => {
      setOverlap(Math.max(0, pageY + height - keyboardY))
    })
  }, [wrapperRef])

  useEffect(() => {
    // iOS fires the "will" event before the keyboard starts animating, which
    // is what lets the padding animate in step with it. Android has no such
    // event — "did" is fired once the keyboard has already finished moving.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

    const show = Keyboard.addListener(showEvent, (event) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      keyboardScreenY.current = event.endCoordinates.screenY
      measure()
    })
    const hide = Keyboard.addListener(hideEvent, () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      keyboardScreenY.current = null
      setOverlap(0)
    })

    return () => {
      show.remove()
      hide.remove()
    }
  }, [measure])

  return overlap
}

export default useKeyboardOverlap
