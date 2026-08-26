import { Pressable, View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Text from './Text'

interface Props {
  onBack: () => void
  /** What this screen is — "Reviews", "Write a review". */
  title: string
  /**
   * What it is ABOUT — usually the spot's name. Optional, because it is often
   * not known until a request comes back, and a line that says nothing is worse
   * than no line.
   */
  subtitle?: string | null
  testID?: string
}

/**
 * The heading on a screen you arrived at from somewhere else: a way back, what
 * this screen is, and what it is about.
 *
 * ## The stacking is the point
 *
 * `← Back` and the heading used to share one row. They are different kinds of
 * thing — a control and a title — and putting them on one line pushes the title
 * off-centre by whatever width the control happens to be, so it lands in a
 * different place on every screen.
 *
 * Back goes on its own line; the title sits under it (STOURIFY-209).
 *
 * ## Why there is a subtitle at all
 *
 * "Reviews" does not say whose reviews. Arrive from a search result, or put the
 * phone down and pick it up again, and the page could be about anywhere.
 *
 * This has now been reported three times about three different screens — a
 * note's replies (STOURIFY-198), the photo gallery (STOURIFY-199), and the
 * review pages (STOURIFY-209). Three reports of one thing is a pattern, which
 * is why this is a shared component rather than a fourth hand-rolled header.
 *
 * `OverlayHeader` is the sibling for screens whose content runs under the
 * header — a full-bleed photo. This one is for ordinary screens where the
 * header sits above the content.
 */
export default function ScreenHeader({ onBack, title, subtitle, testID }: Props) {
  const theme = useTheme()

  return (
    <View
      testID={testID}
      style={{
        paddingHorizontal: theme.gutter,
        paddingTop: theme.spacing[2],
        paddingBottom: theme.spacing[3],
        gap: theme.spacing[1],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={{
          minHeight: theme.minTouchTarget,
          justifyContent: 'center',
          // Only as wide as the words, so the rest of the line is not an
          // invisible target that swallows taps meant for the title.
          alignSelf: 'flex-start',
        }}
      >
        <Text variant="body" color="primary">
          ← Back
        </Text>
      </Pressable>

      <Text variant="h1">{title}</Text>

      {subtitle ? (
        <Text testID={testID ? `${testID}-subtitle` : undefined} variant="body" color="muted">
          {subtitle}
        </Text>
      ) : null}
    </View>
  )
}
