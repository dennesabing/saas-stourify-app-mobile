import { Pressable, StyleSheet } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Text from './Text'

interface Props {
  label: string
  selected?: boolean
  onPress?: () => void
}

/**
 * Pill filter chip — the "All · GenSan · Foodie · Nature" rails in Discover
 * and Community, and the interest picker in Onboarding.
 *
 * Distinct from `Tag`: a Chip is interactive and filters something; a Tag is a
 * static category label on a card.
 */
export default function Chip({ label, selected = false, onPress }: Props) {
  const theme = useTheme()

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.base,
        {
          borderRadius: theme.radius.chip,
          minHeight: theme.minTouchTarget,
          paddingHorizontal: theme.spacing[4],
          backgroundColor: selected ? theme.colors.primary : theme.colors.card,
          borderColor: selected ? theme.colors.primary : theme.colors.hairline,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text variant="caption" color={selected ? 'onButton' : 'muted'}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
})
