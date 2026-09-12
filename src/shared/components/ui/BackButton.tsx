import { Pressable } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Icon from './Icon'

interface Props {
  onPress: () => void
  /**
   * The disc's drawn size. The Create and Discover back bars draw it at 38; the
   * Auth & Entry screens draw it at 42, alone above their heading.
   */
  size?: number
  testID?: string
}

/**
 * The design's round back button: a chevron on a soft disc.
 *
 * It lives on its own so the back bar (`BarHeader`) and the sign-in screens,
 * which draw the disc with no title beside it (STOURIFY-286), are one control
 * rather than two copies that drift. Whatever size it is drawn at, it answers
 * to at least 44 points: `hitSlop` makes up the difference.
 */
export default function BackButton({ onPress, size = 38, testID }: Props) {
  const theme = useTheme()
  const slop = Math.max(0, (theme.minTouchTarget - size) / 2)

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      hitSlop={slop}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceAlt,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon name="back" size={20} />
    </Pressable>
  )
}
