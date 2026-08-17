import { StyleSheet, View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Text from './Text'

interface Props {
  value: number
  reviewCount?: number
  /** Hide the stars and show just the number — for dense card meta rows. */
  compact?: boolean
  /**
   * Put the figures on their own line under the stars instead of beside them.
   *
   * For narrow holders — a Discover grid cell is about 120 points wide inside,
   * and stars plus score plus "· 12 reviews" on one row wants more like 150, so
   * the row simply ran off the card's edge (STOURIFY-101).
   */
  stacked?: boolean
}

/**
 * Star rating. Aqua (`accent-2`) is the handoff's colour for stars — not the
 * brand azure and not gold.
 *
 * Two arrangements. The default puts everything on one row, which is what the
 * Spot Hub header and review lists want. `stacked` puts the stars on one line
 * and the figures underneath, for holders too narrow for the row. Either way no
 * line may push past its container: each is capped at one line and allowed to
 * shrink, so the last resort is an ellipsis rather than a spill.
 */
export default function Rating({ value, reviewCount, compact = false, stacked = false }: Props) {
  const theme = useTheme()
  const rounded = Math.round(value)

  const label = reviewCount
    ? `Rated ${value.toFixed(1)} out of 5 from ${reviewCount} reviews`
    : `Rated ${value.toFixed(1)} out of 5`

  const stars = compact ? (
    <Text variant="caption" style={{ color: theme.colors.accent2 }}>
      ★
    </Text>
  ) : (
    <Text variant="caption" numberOfLines={1} style={{ color: theme.colors.accent2 }}>
      {'★'.repeat(rounded)}
      <Text variant="caption" color="muted">
        {'★'.repeat(Math.max(0, 5 - rounded))}
      </Text>
    </Text>
  )

  if (stacked) {
    // One Text, not a score beside a count: two shrinking siblings on a line
    // this narrow can each give up a character and produce "4… · 12 revi…".
    // A single string ellipsizes once, at the end, where it reads as intended.
    const figures = reviewCount !== undefined ? `${value.toFixed(1)} · ${reviewCount} reviews` : value.toFixed(1)

    return (
      <View style={styles.column} accessibilityLabel={label}>
        {stars}
        <Text
          testID="rating-figures"
          variant="caption"
          color="muted"
          numberOfLines={1}
          style={styles.shrink}
        >
          {figures}
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.row} accessibilityLabel={label}>
      {stars}
      <Text variant="caption" color="ink" numberOfLines={1}>
        {value.toFixed(1)}
      </Text>
      {reviewCount !== undefined && (
        <Text variant="caption" color="muted" numberOfLines={1} style={styles.shrink}>
          · {reviewCount} reviews
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  column: { gap: 2 },
  shrink: { flexShrink: 1 },
})
