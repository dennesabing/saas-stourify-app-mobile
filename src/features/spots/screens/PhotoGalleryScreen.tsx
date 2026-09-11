import { useState } from 'react'
import { Dimensions, FlatList, Pressable, View, type ViewToken } from 'react-native'
import { Image } from 'expo-image'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { HomeStackParamList } from '@/shared/navigation/types'
import { describeRequestFailure } from '@/shared/api/errorMessage'
import { getSpot } from '@/shared/api/spots'
import { EmptyState, OverlayHeader, Skeleton, Text } from '@/shared/components/ui'
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
  const insets = useSafeAreaInsets()
  const [index, setIndex] = useState(0)

  const {
    data: spot,
    error,
    isLoading,
    isError,
    refetch,
  } = useQuery({
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

  /**
   * What the failure panel says, chosen from the failure that actually
   * happened (STOURIFY-248, following STOURIFY-225).
   *
   * This used to be one fixed sentence about the connection, shown for every
   * way a request can go wrong — including the one where the server picked up
   * and refused. `describeRequestFailure` reads the error this screen was
   * already holding and picks words to match. Only the wording moved; the
   * branch above that decides WHETHER to show a failure at all is unchanged.
   */
  const failure = describeRequestFailure(error, 'the photos')

  function onViewableItemsChanged({ viewableItems }: { viewableItems: ViewToken[] }) {
    const first = viewableItems[0]
    if (first && typeof first.index === 'number') setIndex(first.index)
  }

  return (
    /*
      One background, and it is the theme's own (STOURIFY-102).

      This used to switch to `theme.colors.ink` as soon as there were photos to
      show. `ink` is the role for *text*, so a light-themed app opened a
      near-black screen — and because photos are drawn with `contentFit="contain"`,
      every photo that is not exactly the screen's shape framed itself in that
      near-black. Reusing the text colour for a surface is how a palette starts
      meaning two things at once; if a deliberately dark viewer is ever wanted it
      needs a token that says so.
    */
    <SafeAreaView
      testID="gallery-root"
      style={{ flex: 1, backgroundColor: theme.colors.surface }}
      edges={['top']}
    >
      {/*
        Which spot these photos belong to, under the Back button (STOURIFY-199).

        A full-bleed photo with a lone Back button says nothing about what you
        are looking at. Arrive here from a search result, or come back to the
        app a few minutes later, and there is no way to tell — the photo could
        be of anywhere.

        The name only appears once the spot has arrived. Rendering a plaque with
        nothing on it, or with a placeholder, would be worse than rendering no
        plaque: it would claim to answer the question and not answer it.

        Back and the plaque are one shared component with the spot page, which
        is the whole of "make it consistent with the spot page" — two copies of
        the same layout drift the moment one is touched.

        `topInset` is the status bar's height (STOURIFY-255). The header is
        absolutely positioned, so this SafeAreaView's top padding does not reach
        it, and without the inset the Back button sat on the status-bar clock.
        Only the header moves; the photos keep the layout they had.
      */}
      <OverlayHeader
        testID="gallery-header"
        topInset={insets.top}
        onBack={() => navigation.goBack()}
        title={spot?.title}
        subtitle={media.length > 0 ? `Photo ${index + 1} of ${media.length}` : null}
      />

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
            icon={failure.icon}
            title={failure.title}
            subtitle={failure.subtitle}
            actionLabel="Try again"
            onAction={() => void refetch()}
          />
        </View>
      ) : isWaiting ? (
        <View testID="gallery-loading" style={{ flex: 1 }}>
          <Skeleton height={height} radius={0} />
        </View>
      ) : media.length === 0 ? (
        <EmptyState
          icon="🖼"
          title="No photos yet"
          subtitle="This spot has no photos to show yet."
        />
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
                style={{ width, height, backgroundColor: theme.colors.surface }}
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
