import { Pressable, View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Text from './Text'

interface Props {
  onBack: () => void
  /**
   * What the reader is looking at. Optional — a screen with nothing useful to
   * name renders the button alone rather than an empty plaque.
   */
  title?: string | null
  /** Second line, smaller. Used for a position like "2 of 5". */
  subtitle?: string | null
  /**
   * Extra distance from the top, added to the usual gap — pass the status
   * bar's height (`useSafeAreaInsets().top`) when this sits directly in a
   * screen root. See "Why the caller says how tall the status bar is" below.
   */
  topInset?: number
  testID?: string
}

/**
 * The Back button that floats over a photo, and the name of what the photo is
 * of.
 *
 * ## Why this is shared rather than written twice
 *
 * It was written twice — the spot page and the photo gallery each had their own
 * copy of the same absolutely-positioned button, with the same numbers typed
 * out separately. Two copies of a layout drift the moment one is touched, and
 * "the back button is too high, make it consistent with the spot page" is what
 * that drift sounds like from the outside (STOURIFY-199). One component cannot
 * disagree with itself.
 *
 * ## Why the title sits under the button rather than beside it
 *
 * Beside it, a long spot name has to share a line with a control and gets cut
 * off — and the name is the thing that answers "what am I looking at?", so it
 * is the wrong half to truncate. Underneath, it gets the full width.
 *
 * Both sit on the card colour rather than directly on the photo. Text laid
 * straight over a photograph is legible until somebody photographs something
 * pale, and a spot's photos are not ours to choose.
 *
 * ## Why the caller says how tall the status bar is
 *
 * This is absolutely positioned, and an absolutely placed box is measured from
 * its parent's outer edge — a `SafeAreaView` parent's top padding does nothing
 * for it. On the spot page that is harmless: the header sits inside the hero,
 * which is already below the status bar. On the photo gallery it sits directly
 * in the screen root, and without `topInset` the Back button was drawn on top
 * of the status-bar clock (STOURIFY-255). The component cannot add the inset
 * itself, because the spot page would then be pushed down twice.
 */
export default function OverlayHeader({ onBack, title, subtitle, topInset = 0, testID }: Props) {
  const theme = useTheme()

  return (
    <View
      testID={testID}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: topInset + theme.spacing[3],
        left: theme.spacing[3],
        right: theme.spacing[3],
        zIndex: 10,
        gap: theme.spacing[2],
        alignItems: 'flex-start',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={{
          minWidth: theme.minTouchTarget,
          minHeight: theme.minTouchTarget,
          borderRadius: theme.radius.chip,
          backgroundColor: theme.colors.card,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: theme.spacing[3],
        }}
      >
        <Text variant="body" color="ink">
          ← Back
        </Text>
      </Pressable>

      {title ? (
        <View
          testID={testID ? `${testID}-title` : undefined}
          style={{
            maxWidth: '100%',
            borderRadius: theme.radius.chip,
            backgroundColor: theme.colors.card,
            paddingHorizontal: theme.spacing[3],
            paddingVertical: theme.spacing[1],
          }}
        >
          <Text variant="body" color="ink" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" color="muted">
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
