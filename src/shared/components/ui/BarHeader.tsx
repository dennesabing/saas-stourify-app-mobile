import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Icon from './Icon'
import Text from './Text'

interface Props {
  title: string
  onBack: () => void
  /**
   * An optional control drawn at the far end of the row — Nearby's
   * list/map toggle is the first caller (STOURIFY-259). Optional and
   * additive only: `CreateSpotScreen` and `ReviewSpotScreen` pass neither
   * `right` nor anything that depends on it, so they render exactly as
   * before.
   */
  right?: ReactNode
  testID?: string
}

/** The design's `.bb .bk`: a 38-point disc. */
const BACK_SIZE = 38

/**
 * The design's back bar (`.bb` in the Create and Discover artboards): a round
 * back button and the screen's title on one line (STOURIFY-257).
 *
 * `ScreenHeader` stacks Back above the title instead, and the reason it does
 * is worth knowing before choosing between them: a text "← Back" is as wide as
 * its words, so a title beside it lands in a different place on every screen
 * (STOURIFY-209). The disc here is a fixed size, so the title starts at the
 * same x everywhere — which is what makes one line safe again.
 *
 * The disc is drawn at 38 and answers to 44: `hitSlop` makes up the rest.
 */
export default function BarHeader({ title, onBack, right, testID }: Props) {
  const theme = useTheme()
  const slop = (theme.minTouchTarget - BACK_SIZE) / 2

  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: theme.gutter,
        paddingTop: theme.spacing[1],
        paddingBottom: 10,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        hitSlop={slop}
        style={({ pressed }) => ({
          width: BACK_SIZE,
          height: BACK_SIZE,
          borderRadius: BACK_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.surfaceAlt,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Icon name="back" size={20} />
      </Pressable>

      <Text
        variant="h2"
        numberOfLines={1}
        style={{ flexShrink: 1, flexGrow: 1, fontFamily: theme.fontFamily.displayBold }}
      >
        {title}
      </Text>

      {right}
    </View>
  )
}
