import { Image } from 'expo-image'
import { StyleSheet, View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import Card from './Card'
import Rating from './Rating'
import Tag from './Tag'
import Text from './Text'

export interface SpotCardData {
  title: string
  category?: string | null
  imageUri?: string | null
  rating?: number | null
  reviewCount?: number | null
  /** Pre-formatted — "1.2 km away", "Downtown · GenSan". */
  meta?: string | null
  isOpenNow?: boolean | null
  /** Written offline and not yet pushed. Shows the queued affordance. */
  isQueued?: boolean
}

interface Props extends SpotCardData {
  onPress?: () => void
  /** `tall` for the Discover mosaic, `wide` for list rows. */
  layout?: 'tall' | 'wide'
}

/**
 * The most-repeated component in the app — Discover, Nearby, Wishlist, Spot
 * rails and search results all render it. Cost per screen falls sharply once
 * this is right, which is why it lands in M0 rather than with its first screen.
 */
export default function SpotCard({
  title,
  category,
  imageUri,
  rating,
  reviewCount,
  meta,
  isOpenNow,
  isQueued = false,
  onPress,
  layout = 'tall',
}: Props) {
  const theme = useTheme()
  const isWide = layout === 'wide'

  return (
    <Card onPress={onPress} padded={false} accessibilityLabel={title}>
      <View style={isWide ? styles.wide : undefined}>
        <Image
          testID="spot-card-image"
          source={imageUri ? { uri: imageUri } : undefined}
          style={
            isWide
              ? { width: 96, height: 96, backgroundColor: theme.colors.surfaceAlt }
              : { width: '100%', height: 160, backgroundColor: theme.colors.surfaceAlt }
          }
          contentFit="cover"
          transition={theme.motion.fast}
        />

        <View style={{ padding: theme.spacing[3], gap: theme.spacing[1], flex: 1 }}>
          {/*
            The grid draws two of these abreast, so anything that changes height
            between one card and the next knocks everything below it out of
            line. A printed form leaves a blank box for a middle name even when
            there is no middle name, precisely so the fields under it still line
            up — the strip below is that blank box, and the title's two-line
            minimum is the same idea one row lower (STOURIFY-101).

            A wide list row has nothing beside it to line up with, so it keeps
            the old behaviour and wastes no space.
          */}
          {isWide ? (
            category ? (
              <Tag label={category} />
            ) : null
          ) : (
            <View
              testID="spot-card-tag-slot"
              style={{ height: theme.typography.micro.lineHeight + theme.spacing[1] * 2 }}
            >
              {category ? <Tag label={category} /> : null}
            </View>
          )}

          <Text
            variant="h2"
            color="ink"
            numberOfLines={2}
            style={isWide ? undefined : { minHeight: theme.typography.h2.lineHeight * 2 }}
          >
            {title}
          </Text>

          {rating != null ? (
            <Rating
              value={rating}
              reviewCount={reviewCount ?? undefined}
              compact={isWide}
              stacked={!isWide}
            />
          ) : null}

          <View style={styles.metaRow}>
            {meta ? (
              <Text variant="caption" color="muted" numberOfLines={1}>
                {meta}
              </Text>
            ) : null}

            {isOpenNow ? (
              <Text variant="caption" style={{ color: theme.colors.success }}>
                · Open now
              </Text>
            ) : null}
          </View>

          {isQueued ? (
            <Text variant="micro" style={{ color: theme.colors.accent }}>
              Queued ↑
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  wide: { flexDirection: 'row', alignItems: 'stretch' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
})
