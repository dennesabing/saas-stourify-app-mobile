import { useState } from 'react'
import { Dimensions, FlatList, Pressable, View, type ViewToken } from 'react-native'
import { Image } from 'expo-image'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { HomeStackParamList } from '@/shared/navigation/types'
import { getSpot } from '@/shared/api/spots'
import { EmptyState, Skeleton, Text } from '@/shared/components/ui'
import type { SpotMedia } from '@/shared/api/types'
import { useTheme } from '@/theme/ThemeProvider'

const { width, height } = Dimensions.get('window')

type Props = NativeStackScreenProps<HomeStackParamList, 'PhotoGallery'>

/**
 * Full-bleed, swipeable photo gallery — `media[].url` is the only populated
 * field (`thumb_url` is always null today, no conversion is registered), so
 * this renders `url` directly rather than pretending a thumbnail exists.
 */
export default function PhotoGalleryScreen({ route, navigation }: Props) {
  const { spotId } = route.params
  const theme = useTheme()
  const [index, setIndex] = useState(0)

  const { data: spot, isLoading, isError, refetch } = useQuery({
    queryKey: ['spot', spotId],
    queryFn: () => getSpot(spotId),
  })

  const media = spot?.media ?? []

  /**
   * `media` is empty in three completely different situations — the spot has
   * not come back yet, the request broke, and the spot genuinely has no photos
   * — because `spot?.media ?? []` flattens all three into one value. Before
   * STOURIFY-89 the screen printed the third one's sentence for all of them,
   * so a reader on a dead connection was told a place has no photos, which is
   * a claim about the place rather than about the network.
   *
   * These are the same two flags `SpotDetailScreen` was given by STOURIFY-64,
   * deliberately: that screen reads the SAME query key, and two screens fed by
   * one query must not disagree about whether that query has come back. This
   * screen is not a list, so there is no `ListEmptyComponent` to put the
   * branch inside — the placement rule the sibling list screens get for free
   * has to be written out here instead, and `&& !spot` is how.
   *
   * **`&& !spot` is the load-bearing half.** React Query keeps serving a
   * cached spot while a background refetch fails, so `isError` alone is true
   * in the one situation where the reader is happily swiping photos — offline,
   * on a spot they opened yesterday. Reaching for the failure panel there
   * would take a readable gallery off the screen to announce that no spot
   * could be fetched.
   *
   * `isWaiting` is computed after `hasFailed` and excludes it, so a request
   * that came back broken never also reads as still in flight. The flag is
   * `isLoading` rather than `isFetching`, again matching `SpotDetailScreen`:
   * it is true only for a first fetch with nothing cached, so a pressed
   * **Try again** holds the failure copy instead of flickering to a skeleton
   * and back.
   */
  const hasFailed = isError && !spot
  const isWaiting = !hasFailed && (isLoading || !spot)
  const hasPhotos = !hasFailed && !isWaiting && media.length > 0

  function onViewableItemsChanged({ viewableItems }: { viewableItems: ViewToken[] }) {
    const first = viewableItems[0]
    if (first && typeof first.index === 'number') setIndex(first.index)
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: hasPhotos ? theme.colors.ink : theme.colors.surface }}
      edges={['top']}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => navigation.goBack()}
        style={{
          position: 'absolute',
          top: theme.spacing[3],
          left: theme.spacing[3],
          zIndex: 10,
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

      {/*
        Four states, and the ORDER is the fix. Ask "did it come back broken?"
        and "has it come back at all?" BEFORE "are there photos?", and the
        three facts that used to share one sentence stop sharing it.

        The failure panel replaces the gallery rather than sitting over it, and
        that costs nothing here: `hasFailed` requires `!spot`, so there are no
        photos to cover in the state where it renders. That is the same rule
        the sibling list screens get from `ListEmptyComponent` — content always
        wins over an error — expressed for a screen that holds one object.
      */}
      {hasFailed ? (
        <View testID="gallery-error" style={{ flex: 1 }}>
          <EmptyState
            icon="📡"
            title="Couldn't load the photos"
            subtitle="We couldn't reach Stourify just now. Check your connection and try again."
            actionLabel="Try again"
            onAction={() => void refetch()}
          />
        </View>
      ) : isWaiting ? (
        <View testID="gallery-loading" style={{ flex: 1 }}>
          <Skeleton height={height} radius={0} />
        </View>
      ) : media.length === 0 ? (
        <EmptyState icon="🖼" title="No photos yet" subtitle="This spot has no photos to show yet." />
      ) : (
        <>
          <FlatList
            data={media}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.uuid}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
            renderItem={({ item, index: itemIndex }: { item: SpotMedia; index: number }) => (
              <Image
                testID={`gallery-photo-${itemIndex}`}
                source={{ uri: item.url }}
                style={{ width, height }}
                contentFit="contain"
              />
            )}
          />

          <View
            style={{
              position: 'absolute',
              bottom: theme.spacing[5],
              alignSelf: 'center',
              backgroundColor: theme.colors.card,
              borderRadius: theme.radius.chip,
              paddingHorizontal: theme.spacing[4],
              paddingVertical: theme.spacing[1],
            }}
          >
            <Text variant="caption" color="ink">
              {index + 1} / {media.length}
            </Text>
          </View>
        </>
      )}
    </SafeAreaView>
  )
}
