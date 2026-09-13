import { Image } from 'expo-image'
import { Pressable, View } from 'react-native'
import type { SavedSpot } from '@/features/spots/hooks/useSavedSpots'
import { Icon, Tag, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

interface Props {
  item: SavedSpot
  onOpenSpot: (spotUuid: string) => void
  /**
   * Draws artboard 3's filled bookmark at the row's right end, and is called
   * when it is tapped (STOURIFY-303). Omitted, the row has no remove button —
   * the Wishlist tab on your profile, whose artboard draws none.
   */
  onRemove?: () => void
}

/** The photo tile's width — the canvas's `.wcard .th`. */
const PHOTO_WIDTH = 92

/**
 * The app's mark for a thing still on the phone — the same "Queued ↑" a review
 * or a spot card carries (STOURIFY-207).
 */
function QueuedMark() {
  return (
    <View testID="saved-spot-queued">
      <Tag label="Queued ↑" />
    </View>
  )
}

/**
 * The canvas's `.wcard .rt.js-unsave`: a solid bookmark, because the spot IS
 * saved and tapping it is what takes that away — the same filled-means-saved
 * reading as the bookmark on the spot page.
 *
 * It is a sibling of the part that opens the spot, never nested inside it. A
 * button inside a button is one element to a screen reader on Android, so the
 * remove would be unreachable without sight.
 */
function RemoveButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme()

  return (
    <Pressable
      testID="saved-spot-remove"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: theme.minTouchTarget,
        minHeight: theme.minTouchTarget,
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name="bookmark" size={20} color="primary" fill="primary" />
    </Pressable>
  )
}

/**
 * One saved spot, the same row wherever your saves are listed.
 *
 * Two places list them: the Wishlist screen, and the Wishlist tab on your own
 * profile (STOURIFY-288). The row lived inside the screen until that tab
 * arrived; it moved here so the two lists cannot drift into drawing a save
 * differently.
 *
 * Drawn as artboard 3's `.wcard` (STOURIFY-289): a photo tile on the left, a
 * category pill, the title in Fraunces and a pin with the address, and — where
 * the caller can remove saves — a filled bookmark on the right (STOURIFY-303).
 * The canvas also draws a distance and an "offline" tick; neither has anything
 * behind it yet, and STOURIFY-289's spec says why.
 *
 * A save the phone has not sent yet is drawn the same way with the queued mark
 * under it (STOURIFY-207); `useSavedSpots` says where its details come from.
 */
export default function SavedSpotRow({ item, onOpenSpot, onRemove }: Props) {
  const theme = useTheme()
  const { spot } = item

  const plainRow = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.button,
  }

  // A save only this phone knows about, of a spot nothing on the phone can
  // name. It is real and on its way, so it gets a line that says so — not the
  // "no longer available" line below, which would be false.
  if (!spot && item.isPending) {
    return (
      <View testID="saved-spot-pending" style={plainRow}>
        <View style={{ flex: 1, gap: theme.spacing[2], padding: theme.spacing[3] }}>
          <Text variant="body" color="muted">
            Saved on this phone. Details appear once it sends.
          </Text>
          {item.isQueued ? <QueuedMark /> : null}
        </View>
        {onRemove ? (
          <RemoveButton label="Remove this saved spot from your wishlist" onPress={onRemove} />
        ) : null}
      </View>
    )
  }

  // A saved row whose spot is gone. Rendering nothing would silently shorten
  // the list, so it says what happened instead — the alternative is an
  // explorer counting their saves and finding one missing with no reason.
  if (!spot) {
    return (
      <View testID="saved-spot-missing" style={plainRow}>
        <View style={{ flex: 1, padding: theme.spacing[3] }}>
          <Text variant="body" color="muted">
            This spot is no longer available.
          </Text>
        </View>
        {onRemove ? (
          <RemoveButton label="Remove this saved spot from your wishlist" onPress={onRemove} />
        ) : null}
      </View>
    )
  }

  const photo = spot.thumbUrl
  const category = spot.categories[0]

  return (
    <View
      style={{
        flexDirection: 'row',
        minHeight: PHOTO_WIDTH,
        overflow: 'hidden',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.hairline,
        backgroundColor: theme.colors.card,
      }}
    >
      <Pressable
        onPress={() => onOpenSpot(spot.uuid)}
        accessibilityRole="button"
        accessibilityLabel={spot.title}
        accessibilityHint={item.isQueued ? 'Saved on this phone, waiting to sync' : undefined}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: 'row',
          gap: theme.spacing[3],
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
            paddingRight: onRemove ? 0 : theme.spacing[3],
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

          {item.isQueued ? <QueuedMark /> : null}
        </View>
      </Pressable>

      {onRemove ? (
        <RemoveButton label={`Remove ${spot.title} from your wishlist`} onPress={onRemove} />
      ) : null}
    </View>
  )
}
