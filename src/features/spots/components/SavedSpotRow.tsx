import { View } from 'react-native'
import { thumbFor } from '@/features/discover/api/exploreSpots'
import type { WishlistItem } from '@/shared/api/wishlist'
import { SpotCard, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

interface Props {
  item: WishlistItem
  onOpenSpot: (spotUuid: string) => void
}

/**
 * One saved spot, the same row wherever your saves are listed.
 *
 * Two places list them: the Saved spots screen, and the Wishlist tab on your
 * own profile (STOURIFY-288). The row lived inside the screen until that tab
 * arrived; it moved here so the two lists cannot drift into drawing a save
 * differently.
 */
export default function SavedSpotRow({ item, onOpenSpot }: Props) {
  const theme = useTheme()
  const { spot } = item

  // A saved row whose spot is gone. Rendering nothing would silently shorten
  // the list, so it says what happened instead — the alternative is an
  // explorer counting their saves and finding one missing with no reason.
  if (!spot) {
    return (
      <View
        testID="saved-spot-missing"
        style={{
          padding: theme.spacing[3],
          backgroundColor: theme.colors.surfaceAlt,
          borderRadius: theme.radius.card,
        }}
      >
        <Text variant="body" color="muted">
          This spot is no longer available.
        </Text>
      </View>
    )
  }

  return (
    <SpotCard
      title={spot.title}
      layout="wide"
      category={spot.categories?.[0]}
      imageUri={thumbFor(spot)}
      rating={spot.rating_average}
      reviewCount={spot.reviews_count}
      meta={spot.address}
      onPress={() => onOpenSpot(spot.uuid)}
    />
  )
}
