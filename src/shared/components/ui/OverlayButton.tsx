import { Pressable } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Icon, { type IconName } from './Icon'

interface Props {
  icon: IconName
  /** Required: the disc carries no words, so this is the only name it has. */
  accessibilityLabel: string
  /** What tapping it will do, when the label alone does not say — "Saved" does not say "tap to remove". */
  accessibilityHint?: string
  onPress: () => void
  /** Draw the glyph solid — a bookmark once the spot is saved. */
  filled?: boolean
  disabled?: boolean
  selected?: boolean
  testID?: string
}

/** The canvas's `.cbtn` is 40 across; `hitSlop` makes up the rest of 44. */
const SIZE = 40

/**
 * A round control that sits on a photo: the Spot Hub's Back and Save
 * (`.cbtn` in `docs/design/Stourify - Spot Hub.dc.html`, STOURIFY-292).
 *
 * Distinct from `BackButton`, which is a soft disc on the page's own paper. On a
 * photo that disc would be a pale circle on whatever the contributor happened to
 * photograph, and a pale sky makes it vanish. This one is a dark wash with a
 * white glyph, so it reads the same over any picture.
 */
export default function OverlayButton({
  icon,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  filled = false,
  disabled,
  selected,
  testID,
}: Props) {
  const theme = useTheme()
  const slop = (theme.minTouchTarget - SIZE) / 2

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected === undefined ? undefined : { selected }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={slop}
      style={({ pressed }) => ({
        width: SIZE,
        height: SIZE,
        borderRadius: SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.overlay,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon name={icon} size={20} color="onButton" fill={filled ? 'onButton' : undefined} />
    </Pressable>
  )
}
