import { useEffect, useState } from 'react'
import type { NavigationProp, ParamListBase } from '@react-navigation/native'

type Focusable = Pick<NavigationProp<ParamListBase>, 'addListener' | 'isFocused'>

/**
 * Whether this screen is the one on top of its stack right now.
 *
 * Welcome needs it for one reason: it paints the status bar's icons white while
 * it is showing (STOURIFY-286). A stack keeps Welcome mounted underneath Log In,
 * so "mounted" is not "showing" — a white status bar left behind by a screen you
 * can no longer see would put white icons on Log In's pale page.
 *
 * A test's stand-in navigation has no events; it is treated as always on top,
 * which is what a lone screen is.
 */
export function useScreenFocused(navigation: Focusable): boolean {
  const [focused, setFocused] = useState(() => navigation.isFocused?.() ?? true)

  useEffect(() => {
    if (typeof navigation.addListener !== 'function') return

    const offFocus = navigation.addListener('focus', () => setFocused(true))
    const offBlur = navigation.addListener('blur', () => setFocused(false))

    return () => {
      offFocus()
      offBlur()
    }
  }, [navigation])

  return focused
}
