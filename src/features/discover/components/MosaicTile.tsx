import { useId } from 'react'
import { Image } from 'expo-image'
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { Icon, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

interface Props {
  title: string
  category?: string | null
  rating?: number | null
  imageUri: string | null
  /** One of the two alternating heights the masonry column assigns it. */
  height: number
  onPress: () => void
}

/**
 * One cell of Explore's photo mosaic (STOURIFY-259, artboard 1).
 *
 * A full-bleed photo with a scrim over its lower half and the title on top,
 * replacing the old `SpotCard` grid cell. The scrim is a real vertical
 * gradient — clear at 45% of the tile's height, `theme.colors.scrim` at the
 * bottom, matching the design's own `linear-gradient(180deg, transparent 45%,
 * rgba(0,0,0,.5))` — drawn with `react-native-svg`, already a dependency
 * since `Icon` renders through it (STOURIFY-257). A flat panel shipped here
 * first for want of a gradient; there was one all along.
 */
export default function MosaicTile({ title, category, rating, imageUri, height, onPress }: Props) {
  const theme = useTheme()
  // Gradient ids live in one global SVG namespace on some platforms, so a
  // fixed id would make every tile on screen point at whichever tile's
  // `<LinearGradient>` happened to register last. `useId()` wraps its value in
  // `«»` (React 19) or `::` (older React), which `react-native-svg` can fail
  // to resolve inside `url(#...)` — a broken fade that jest cannot see and a
  // device can, so the punctuation is stripped rather than passed through.
  const gradientId = 'mosaic-tile-scrim-' + useId().replace(/[^A-Za-z0-9_-]/g, '')

  const metaParts: string[] = []
  if (category) metaParts.push(category)
  if (rating != null) metaParts.push(`★ ${rating.toFixed(1)}`)
  const meta = metaParts.join(' · ')

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.base,
        { height, borderRadius: 14, opacity: pressed ? 0.92 : 1 },
      ]}
    >
      {imageUri ? (
        <Image
          testID="mosaic-tile-image"
          source={{ uri: imageUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={theme.motion.fast}
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.placeholder,
            { backgroundColor: theme.colors.surfaceAlt },
          ]}
        >
          <Icon name="pin" color="muted" size={22} />
        </View>
      )}

      <Svg style={styles.scrim} width="100%" height="100%">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.45" stopColor={theme.colors.scrim} stopOpacity={0} />
            <Stop offset="1" stopColor={theme.colors.scrim} stopOpacity={0.9} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>

      <View style={[styles.textBlock, { padding: theme.spacing[2] }]}>
        <Text
          variant="caption"
          color="onButton"
          numberOfLines={2}
          style={{ fontFamily: theme.fontFamily.bodyBold }}
        >
          {title}
        </Text>
        {meta ? (
          <Text variant="micro" color="onButton" style={styles.meta}>
            {meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  scrim: StyleSheet.absoluteFillObject,
  textBlock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  meta: { textTransform: 'none', opacity: 0.9, marginTop: 2 },
})
