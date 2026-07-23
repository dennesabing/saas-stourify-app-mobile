import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * Whether the OS "reduce motion" setting is on.
 *
 * React Native does not ship a hook for this (the similarly named one lives in
 * Reanimated, which this app does not use), so it wraps AccessibilityInfo and
 * subscribes to changes — the user can toggle the setting while the app runs.
 *
 * Respecting it is part of the definition of done, not a nicety.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    let active = true

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduced(enabled)
    })

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)

    return () => {
      active = false
      subscription.remove()
    }
  }, [])

  return reduced
}
