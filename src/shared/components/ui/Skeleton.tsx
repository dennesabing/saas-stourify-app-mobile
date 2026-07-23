import { useEffect, useRef } from 'react'
import { Animated, Easing, type ViewStyle } from 'react-native'
import { useReducedMotion } from '@/shared/hooks/useReducedMotion'
import { useTheme } from '@/theme/ThemeProvider'

interface Props {
  width?: number | `${number}%`
  height?: number
  radius?: number
  style?: ViewStyle
}

/**
 * Cold-load placeholder.
 *
 * Per the offline-first rule in the spec, this should appear only on a true
 * first fetch — once anything is cached, screens render real content. A
 * skeleton on a warm screen is a bug, not a loading state.
 *
 * Honours reduce-motion: the pulse stops, the placeholder stays.
 */
export default function Skeleton({ width = '100%', height = 16, radius, style }: Props) {
  const theme = useTheme()
  const reduceMotion = useReducedMotion()
  const pulse = useRef(new Animated.Value(0.6)).current

  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(0.8)
      return
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: theme.motion.slow,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.6,
          duration: theme.motion.slow,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    )

    loop.start()

    return () => loop.stop()
  }, [pulse, reduceMotion, theme.motion.slow])

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[
        {
          width,
          height,
          borderRadius: radius ?? theme.radius.button,
          backgroundColor: theme.colors.surfaceAlt,
          opacity: pulse,
        },
        style,
      ]}
    />
  )
}
