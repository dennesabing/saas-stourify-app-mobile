import { Pressable, View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Text from './Text'

export interface SegmentOption<K extends string> {
  key: K
  label: string
}

interface Props<K extends string> {
  options: SegmentOption<K>[]
  value: K
  onChange: (key: K) => void
  testID?: string
}

/** How tall a segment is drawn; `hitSlop` makes up the rest of 44. */
const SEGMENT_HEIGHT = 36

/**
 * The design's segmented switch — the Spots / People / Places strip on Search
 * results, and the same shape the Review artboard draws for visibility
 * (STOURIFY-259). A grey track with the chosen segment raised onto a white card.
 *
 * Distinct from a `Chip` rail: chips filter a list and several can sit in a
 * scrolling row; a segmented control picks exactly one of a few views, and all
 * of them are always visible.
 */
export default function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  testID,
}: Props<K>) {
  const theme = useTheme()
  const slop = (theme.minTouchTarget - SEGMENT_HEIGHT) / 2

  // In the dark palette `card` and `surfaceAlt` are the same colour, so a
  // "raised white card" segment disappears into its own track and neither side
  // reads as chosen — found on the Followers / Following switch (STOURIFY-289).
  // Dark fills the chosen segment with the button slate instead; light keeps
  // the design's raised white card.
  const dark = theme.scheme === 'dark'
  const chosenBackground = dark ? theme.colors.button : theme.colors.card

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        gap: theme.spacing[1],
        padding: theme.spacing[1],
        borderRadius: theme.radius.button,
        backgroundColor: theme.colors.surfaceAlt,
      }}
    >
      {options.map((option) => {
        const selected = option.key === value

        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            hitSlop={{ top: slop, bottom: slop }}
            style={[
              {
                flex: 1,
                minHeight: SEGMENT_HEIGHT,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 9,
              },
              selected ? [theme.elevation.raised, { backgroundColor: chosenBackground }] : null,
            ]}
          >
            <Text
              variant="caption"
              color={selected ? (dark ? 'onButton' : 'ink') : 'muted'}
              style={{ fontFamily: theme.fontFamily.bodySemiBold }}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
