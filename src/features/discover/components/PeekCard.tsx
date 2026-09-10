import { Image } from 'expo-image'
import { Pressable, View } from 'react-native'
import { Icon, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

interface Props {
  title: string
  category?: string | null
  address?: string | null
  rating?: number | null
  imageUri: string | null
  onPress: () => void
}

/**
 * The map's peek card (STOURIFY-259, artboard 4) — what floats up when a pin
 * is tapped. Replaces the `SpotCard` `wide` layout `MapScreen` used to draw
 * here; this one matches the design's own card rather than the grid's.
 *
 * The whole card opens the spot, and so does the round go button on its own —
 * both call the same `onPress`, so there is exactly one place that decides
 * what tapping this peek card means.
 */
export default function PeekCard({ title, category, address, rating, imageUri, onPress }: Props) {
  const theme = useTheme()

  const caption = [category, address].filter(Boolean).join(' · ')

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: theme.spacing[3],
        backgroundColor: theme.colors.card,
        borderRadius: theme.radius.card,
        padding: 11,
        opacity: pressed ? 0.92 : 1,
        ...theme.elevation.floating,
      })}
    >
      {imageUri ? (
        <Image
          testID="peek-card-image"
          source={{ uri: imageUri }}
          style={{
            width: 64,
            height: 64,
            borderRadius: 12,
            backgroundColor: theme.colors.surfaceAlt,
          }}
          contentFit="cover"
          transition={theme.motion.fast}
        />
      ) : (
        <View
          testID="peek-card-image"
          style={{
            width: 64,
            height: 64,
            borderRadius: 12,
            backgroundColor: theme.colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="pin" color="muted" size={20} />
        </View>
      )}

      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: theme.fontFamily.displaySemiBold, fontSize: 15, lineHeight: 20 }}
        >
          {title}
        </Text>
        {caption ? (
          <Text variant="caption" color="muted" numberOfLines={1} style={{ marginTop: 3 }}>
            {caption}
          </Text>
        ) : null}
        {rating != null ? (
          <Text
            variant="caption"
            numberOfLines={1}
            style={{
              color: theme.colors.accent2,
              fontFamily: theme.fontFamily.bodyBold,
              marginTop: 5,
            }}
          >
            ★ {rating.toFixed(1)}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Go to ${title}`}
        style={{
          alignSelf: 'center',
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: theme.colors.button,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="navigate" size={18} color="onButton" />
      </Pressable>
    </Pressable>
  )
}
