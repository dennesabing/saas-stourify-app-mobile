import { Pressable, StyleSheet } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Text from './Text'

interface Props {
  label: string
  selected?: boolean
  onPress?: () => void
}

/** How tall the pill is drawn. The design's `.chip` is 7px + 18px + 7px. */
const VISUAL_HEIGHT = 32

/**
 * Pill filter chip — the "All · GenSan · Foodie · Nature" rails in Discover
 * and Community, the interest picker in Onboarding, and the category picker on
 * New Spot.
 *
 * Distinct from `Tag`: a Chip is interactive and filters something; a Tag is a
 * static category label on a card.
 *
 * Drawn the way every design file draws `.chip`: a borderless pill on the
 * translucent brand fill with badge-ink text, turning solid azure when picked
 * (STOURIFY-257). It used to be a white pill with a hairline border and grey
 * text, which appears in none of them.
 *
 * The pill is drawn 32 tall but still answers to a 44-point finger:
 * `hitSlop` makes up the difference, so the touch target stays at the minimum
 * without the pill itself looking swollen.
 */
export default function Chip({ label, selected = false, onPress }: Props) {
  const theme = useTheme()
  const slop = (theme.minTouchTarget - VISUAL_HEIGHT) / 2

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={{ top: slop, bottom: slop }}
      style={({ pressed }) => [
        styles.base,
        {
          borderRadius: theme.radius.chip,
          minHeight: VISUAL_HEIGHT,
          paddingHorizontal: 14,
          backgroundColor: selected ? theme.colors.primary : theme.colors.badgeBg,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        variant="caption"
        color={selected ? 'onButton' : 'badgeInk'}
        style={{ fontFamily: theme.fontFamily.bodySemiBold }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
})
