import { Text as RNText, View, type ViewStyle } from 'react-native'
import { BUILD_IDENTITY } from '@/shared/config/buildIdentity'
import { useTheme } from '@/theme/ThemeProvider'

interface Props {
  style?: ViewStyle
  /**
   * Overrides the text colour. Needed only by screens that paint their own
   * background instead of the theme's — Settings is dark whatever the theme
   * says, and the themed muted grey is hard to read on it.
   */
  color?: string
}

/**
 * One quiet line naming this build — `Stourify 0.3.0 · a1b2c3d`.
 *
 * It is the app's own label, and it is here for whoever is about to trust what a
 * live test run shows them: before believing any of it, they read this line and
 * check it against the bundle they built. See
 * `@/shared/config/buildIdentity` for why the value must come from the
 * JavaScript bundle and not from the installed package.
 *
 * It sits on every screen a person can reach BEFORE signing in, because a fresh
 * device is exactly the case where you have no other way to ask.
 *
 * `RNText` rather than the `Text` primitive, deliberately: the primitive maps a
 * fixed type scale, and this needs to be smaller and dimmer than anything on it
 * — it is an instrument reading, not content.
 */
export default function BuildIdentity({ style, color }: Props) {
  const theme = useTheme()

  return (
    <View style={[{ alignItems: 'center', paddingVertical: theme.spacing[3] }, style]}>
      <RNText
        testID="build-identity"
        accessibilityLabel={`Build ${BUILD_IDENTITY}`}
        style={{ color: color ?? theme.colors.muted, fontSize: 11, letterSpacing: 0.3 }}
      >
        {BUILD_IDENTITY}
      </RNText>
    </View>
  )
}
