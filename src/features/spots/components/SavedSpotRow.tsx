import { Image } from 'expo-image'
import { Pressable, View } from 'react-native'
import { thumbFor } from '@/features/discover/api/exploreSpots'
import type { WishlistItem } from '@/shared/api/wishlist'
import { Icon, Tag, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

interface Props {
  item: WishlistItem
  onOpenSpot: (spotUuid: string) => void
}

/** The photo tile's width — the canvas's `.wcard .th`. */
const PHOTO_WIDTH = 92

/**
 * One saved spot, the same row wherever your saves are listed.
 *
 * Two places list them: the Wishlist screen, and the Wishlist tab on your own
 * profile (STOURIFY-288). The row lived inside the screen until that tab
 * arrived; it moved here so the two lists cannot drift into drawing a save
 * differently.
 *
 * Drawn as artboard 3's `.wcard` (STOURIFY-289): a photo tile on the left, a
 * category pill, the title in Fraunces and a pin with the address. The canvas
 * also draws a distance, an "offline" tick and an unsave button; none of them
 * has anything behind it yet, and the card's spec says why for each.
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
          borderRadius: theme.radius.button,
        }}
      >
        <Text variant="body" color="muted">
          This spot is no longer available.
        </Text>
      </View>
    )
  }

  const photo = thumbFor(spot)
  const category = spot.categories?.[0]

  return (
    <Pressable
      onPress={() => onOpenSpot(spot.uuid)}
      accessibilityRole="button"
      accessibilityLabel={spot.title}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: theme.spacing[3],
        minHeight: PHOTO_WIDTH,
        overflow: 'hidden',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.hairline,
        backgroundColor: theme.colors.card,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {photo ? (
        <Image
          testID="saved-spot-photo"
          source={{ uri: photo }}
          contentFit="cover"
          transition={theme.motion.fast}
          style={{ width: PHOTO_WIDTH, alignSelf: 'stretch' }}
        />
      ) : (
        // No photo yet (or its thumbnail is still being made). A tinted tile
        // with a pin, never an empty grey box — grey reads as "failed to load"
        // (STOURIFY-264).
        <View
          testID="saved-spot-photo-empty"
          style={{
            width: PHOTO_WIDTH,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.badgeBg,
          }}
        >
          <Icon name="pin" size={20} color="badgeInk" />
        </View>
      )}

      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          gap: theme.spacing[1],
          paddingVertical: 11,
          paddingRight: theme.spacing[3],
        }}
      >
        {category ? <Tag label={category} /> : null}

        <Text
          variant="body"
          numberOfLines={2}
          style={{ fontFamily: theme.fontFamily.displayBold, fontSize: 15, lineHeight: 20 }}
        >
          {spot.title}
        </Text>

        {spot.address ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] }}>
            <Icon name="pin" size={12} color="muted" />
            <Text variant="caption" color="muted" numberOfLines={1} style={{ flex: 1 }}>
              {spot.address}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}
