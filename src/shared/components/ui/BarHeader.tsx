import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import BackButton from './BackButton'
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
  /**
   * A smaller second line under the title — which spot a gallery or a reviews
   * list belongs to (STOURIFY-293). Optional and additive: a caller that passes
   * none gets the one-line bar it always had, and a `null` draws no empty line.
   */
  subtitle?: string | null
  testID?: string
}

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
 * The disc is `BackButton` at its default 38 (`.bb .bk`), shared with the
 * sign-in screens since STOURIFY-286.
 */
export default function BarHeader({ title, onBack, right, subtitle, testID }: Props) {
  const theme = useTheme()

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
      <BackButton onPress={onBack} />

      <View style={{ flexShrink: 1, flexGrow: 1 }}>
        <Text variant="h2" numberOfLines={1} style={{ fontFamily: theme.fontFamily.displayBold }}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            testID={testID ? `${testID}-subtitle` : undefined}
            variant="caption"
            color="muted"
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right}
    </View>
  )
}
