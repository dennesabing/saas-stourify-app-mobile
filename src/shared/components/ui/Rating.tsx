import { StyleSheet, View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Text from './Text'

interface Props {
  value: number
  reviewCount?: number
  /** Hide the stars and show just the number — for dense card meta rows. */
  compact?: boolean
}

/**
 * Star rating. Aqua (`accent-2`) is the handoff's colour for stars — not the
 * brand azure and not gold.
 */
export default function Rating({ value, reviewCount, compact = false }: Props) {
  const theme = useTheme()
  const rounded = Math.round(value)

  const label = reviewCount
    ? `Rated ${value.toFixed(1)} out of 5 from ${reviewCount} reviews`
    : `Rated ${value.toFixed(1)} out of 5`

  return (
    <View style={styles.row} accessibilityLabel={label}>
      {!compact && (
        <Text variant="caption" style={{ color: theme.colors.accent2 }}>
          {'★'.repeat(rounded)}
          <Text variant="caption" color="muted">
            {'★'.repeat(Math.max(0, 5 - rounded))}
          </Text>
        </Text>
      )}
      {compact && (
        <Text variant="caption" style={{ color: theme.colors.accent2 }}>
          ★
        </Text>
      )}
      <Text variant="caption" color="ink">
        {value.toFixed(1)}
      </Text>
      {reviewCount !== undefined && (
        <Text variant="caption" color="muted">
          · {reviewCount} reviews
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
})
