import { Pressable, View } from 'react-native'
import type { SavedSpotsRest } from '@/features/spots/hooks/useSavedSpots'
import { Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

interface Props {
  rest: SavedSpotsRest
  onRetry: () => void
}

/**
 * One line above a Saved list that is showing only the saves this phone holds,
 * because the server's list is not in hand (STOURIFY-207).
 *
 * Without it the list would read as complete. The full-screen failure panel is
 * no answer either: it would hide saves the phone definitely has, which is the
 * very gap this card closed. So the saves show, and this says what is missing.
 *
 * The wording follows what is actually happening. Offline with nothing read
 * before, the request is not failing — it waits for a connection and would wait
 * forever — so it says the rest will come when you are back online rather than
 * promising "loading".
 */
export default function SavedSpotsNotice({ rest, onRetry }: Props) {
  const theme = useTheme()
  if (rest === null) return null

  return (
    <View
      testID="saved-spots-notice"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing[2],
        paddingHorizontal: theme.gutter,
        paddingBottom: theme.spacing[3],
      }}
    >
      <Text variant="caption" color="muted" style={{ flex: 1 }}>
        {rest === 'failed'
          ? "Couldn't load the rest of your saved spots"
          : rest === 'offline'
            ? "The rest of your saved spots will load when you're back online."
            : 'Loading the rest of your saved spots…'}
      </Text>

      {rest === 'failed' ? (
        <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={theme.spacing[2]}>
          <Text variant="caption" color="primary">
            Try again
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}
