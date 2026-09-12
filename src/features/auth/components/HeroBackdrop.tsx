import { StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { useTheme } from '@/theme/ThemeProvider'

interface Props {
  /**
   * Fade to navy at the top edge and, heavily, at the bottom — Welcome's
   * overlay, which is what keeps its white headline readable over the lighter
   * end of the gradient. Splash, whose text sits mid-screen, draws none.
   */
  shade?: boolean
}

/**
 * The brand gradient that Splash and Welcome are painted on (STOURIFY-286).
 *
 * Picture a sheet of coloured card laid behind the screen: it fills the whole
 * frame, takes no taps, and everything else is drawn on top of it. Drawn with
 * `react-native-svg`, which the app already carries for its icons, so the
 * gradient costs no new dependency.
 *
 * The colours are theme tokens (`heroFrom` → `heroVia` → `heroTo`), so a dark
 * phone gets the deepened set rather than the canvas's bright one.
 */
export default function HeroBackdrop({ shade = false }: Props) {
  const theme = useTheme()

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          {/* 165° in the canvas: from just left of the top to just right of the bottom. */}
          <LinearGradient id="heroBrand" x1="0.37" y1="0" x2="0.63" y2="1">
            <Stop offset="0" stopColor={theme.colors.heroFrom} />
            <Stop offset="0.55" stopColor={theme.colors.heroVia} />
            <Stop offset="1" stopColor={theme.colors.heroTo} />
          </LinearGradient>
          {shade ? (
            // The canvas's `linear-gradient(180deg, .4, transparent 26%,
            // transparent 50%, .9)` over its photo, kept for the same reason.
            <LinearGradient id="heroShade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={theme.colors.heroShade} stopOpacity={0.4} />
              <Stop offset="0.26" stopColor={theme.colors.heroShade} stopOpacity={0} />
              <Stop offset="0.5" stopColor={theme.colors.heroShade} stopOpacity={0} />
              <Stop offset="1" stopColor={theme.colors.heroShade} stopOpacity={0.9} />
            </LinearGradient>
          ) : null}
        </Defs>
        <Rect width="100%" height="100%" fill="url(#heroBrand)" />
        {shade ? <Rect width="100%" height="100%" fill="url(#heroShade)" /> : null}
      </Svg>
    </View>
  )
}
