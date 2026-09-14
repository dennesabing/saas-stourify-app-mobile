import { useMemo, useRef, useState } from 'react'
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  View,
  type ViewToken,
} from 'react-native'
import { Image } from 'expo-image'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { HomeStackParamList } from '@/shared/navigation/types'
import { describeRequestFailure } from '@/shared/api/errorMessage'
import { getSpot, getSpotPosts } from '@/shared/api/spots'
import {
  Avatar,
  BarHeader,
  EmptyState,
  Icon,
  OverlayButton,
  SegmentedControl,
  Skeleton,
  Text,
} from '@/shared/components/ui'
import type { SegmentOption } from '@/shared/components/ui'
import {
  galleryPhotos,
  type GalleryPhoto,
  type GallerySort,
} from '@/features/spots/utils/galleryPhotos'
import { clampAspect, justifyRows } from '@/features/spots/utils/justifyRows'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<HomeStackParamList, 'PhotoGallery'>

type SortKey = GallerySort

const SORT_OPTIONS: SegmentOption<SortKey>[] = [
  { key: 'recent', label: 'Most recent' },
  { key: 'top', label: 'Top rated' },
]

/** The canvas's `.g-grid`: 12 points of padding and 4 between photos. */
const GRID_PADDING = 12
const GRID_GAP = 4
/** Three squares to a row on a phone, which is where the canvas's grid sits. */
const TARGET_ROW_HEIGHT = 120

/**
 * Every photo of a spot, in the Spot Hub design's album grid (STOURIFY-293,
 * artboard 2).
 *
 * ## Which photos
 *
 * Two kinds, and until this card the gallery showed only the first:
 * - **the spot's own photos**, `spot.media`, from whoever put the spot on the
 *   map. They come from `['spot', id]`, the same query as before.
 * - **the photos people posted here**, from `['spot-posts', id]` — the very
 *   request and key the spot page's Photos tab uses, so the two screens share
 *   one answer. These have an author, a like count and a post to open, which is
 *   what the lightbox's foot and "Top rated" are made of.
 *
 * The spot's own photos come first under Most recent (they are what the spot
 * page's photo shows, so the gallery opens on something familiar) and last
 * under Top rated, because they have no likes to rank by. "Top rated" asks the
 * server for posts sorted by `likes_count`, which `PostIndexRequest` allows; it
 * is its own key, `['spot-posts', id, 'top']`, and is fetched only once chosen.
 *
 * ## The grid
 *
 * Justified rows (`justifyRows`): every photo at its own shape, each full row
 * filling the width. A photo's shape is learned from its thumbnail as it loads
 * — the conversion keeps the photo's proportions — and a photo not yet loaded
 * is laid out as a square meanwhile.
 */
export default function PhotoGalleryScreen({ route, navigation }: Props) {
  const { spotId } = route.params
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const window = Dimensions.get('window')

  const [sort, setSort] = useState<SortKey>('recent')
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [aspects, setAspects] = useState<Record<string, number>>({})
  const [gridWidth, setGridWidth] = useState(window.width - GRID_PADDING * 2)

  const spotQuery = useQuery({
    queryKey: ['spot', spotId],
    queryFn: () => getSpot(spotId),
  })

  const recentQuery = useQuery({
    queryKey: ['spot-posts', spotId],
    queryFn: () => getSpotPosts(spotId),
  })

  const topQuery = useQuery({
    queryKey: ['spot-posts', spotId, 'top'],
    queryFn: () => getSpotPosts(spotId, 'likes_count'),
    enabled: sort === 'top',
  })

  const spot = spotQuery.data

  // While the most-liked order is on its way, keep showing the posts already in
  // hand rather than emptying the grid for a moment.
  const posts = (sort === 'top' ? (topQuery.data ?? recentQuery.data) : recentQuery.data)?.data

  // The spot page's "View all N photos" counts this same list (STOURIFY-310).
  const photos = useMemo(() => galleryPhotos(spot?.media, posts, sort), [spot, posts, sort])

  /**
   * The same four states the gallery has had since STOURIFY-89, asked in the
   * same order, with a second request folded in.
   *
   * - **Content wins.** Any photo in hand is shown, even while a refetch fails —
   *   offline, on a spot opened yesterday, the reader keeps the photos. The one
   *   condition is that the spot itself has answered (or failed), so the spot's
   *   own photos never arrive late and shove the posted ones along.
   * - **A failure is said only with nothing to show**, and "no photos" is said
   *   only once BOTH requests have answered. A spot with no photos of its own
   *   whose posts could not be fetched has not been shown to have no photos.
   */
  const spotFailed = spotQuery.isError && !spot
  const hasContent = photos.length > 0 && (spot !== undefined || spotFailed)
  const postsFailed = recentQuery.isError && !recentQuery.data
  const hasFailed = !hasContent && (spotFailed || (spot !== undefined && postsFailed))
  const isWaiting = !hasContent && !hasFailed && (!spot || recentQuery.isLoading)

  /** Chosen from the failure that actually happened (STOURIFY-248). */
  const failure = describeRequestFailure(
    spotFailed ? spotQuery.error : recentQuery.error,
    'the photos',
  )

  const rows = useMemo(
    () =>
      justifyRows(
        photos.map((photo) => aspects[photo.key] ?? 1),
        gridWidth,
        { targetHeight: TARGET_ROW_HEIGHT, gap: GRID_GAP },
      ),
    [photos, aspects, gridWidth],
  )

  function learnAspect(key: string, width: number, height: number) {
    if (width <= 0 || height <= 0) return
    setAspects((known) => (known[key] ? known : { ...known, [key]: width / height }))
  }

  function retry() {
    void spotQuery.refetch()
    void recentQuery.refetch()
  }

  return (
    <SafeAreaView
      testID="gallery-root"
      style={{ flex: 1, backgroundColor: theme.colors.surface }}
      edges={['top', 'bottom']}
    >
      {/*
        The design's round back bar, "Photos · N" (STOURIFY-293). The spot's name
        rides on its second line, because a gallery of photos says nothing about
        where they were taken (STOURIFY-199). The count appears once there is
        something to count; before that the title claims no number.
      */}
      <BarHeader
        testID="gallery-header"
        title={hasContent ? `Photos · ${photos.length}` : 'Photos'}
        subtitle={spot?.title}
        onBack={() => navigation.goBack()}
      />

      {hasFailed ? (
        <View testID="gallery-error" style={{ flex: 1 }}>
          <EmptyState
            icon={failure.icon}
            title={failure.title}
            subtitle={failure.subtitle}
            actionLabel="Try again"
            onAction={retry}
          />
        </View>
      ) : isWaiting ? (
        <View testID="gallery-loading" style={{ flex: 1, padding: GRID_PADDING, gap: GRID_GAP }}>
          <Skeleton height={TARGET_ROW_HEIGHT} radius={0} />
          <Skeleton height={TARGET_ROW_HEIGHT} radius={0} />
          <Skeleton height={TARGET_ROW_HEIGHT} radius={0} />
        </View>
      ) : !hasContent ? (
        <EmptyState
          icon="🖼"
          title="No photos yet"
          subtitle="This spot has no photos to show yet."
        />
      ) : (
        <>
          <View style={{ paddingHorizontal: theme.gutter, paddingBottom: theme.spacing[1] }}>
            <SegmentedControl
              testID="gallery-sort"
              options={SORT_OPTIONS}
              value={sort}
              onChange={setSort}
            />
          </View>

          <ScrollView contentContainerStyle={{ padding: GRID_PADDING }}>
            <View
              onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
              style={{ gap: GRID_GAP }}
            >
              {rows.map((row) => (
                <View
                  key={photos[row.items[0]].key}
                  style={{ flexDirection: 'row', gap: GRID_GAP }}
                >
                  {row.items.map((index) => {
                    const photo = photos[index]
                    const likes = photo.post?.likes_count ?? 0

                    return (
                      <Pressable
                        key={photo.key}
                        testID={`gallery-tile-${photo.key}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Photo ${index + 1} of ${photos.length}`}
                        onPress={() => setOpenIndex(index)}
                        style={{
                          width: clampAspect(aspects[photo.key]) * row.height,
                          height: row.height,
                          overflow: 'hidden',
                          backgroundColor: theme.colors.surfaceAlt,
                        }}
                      >
                        <Image
                          source={{ uri: photo.thumb }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                          onLoad={(event) =>
                            learnAspect(photo.key, event.source.width, event.source.height)
                          }
                        />

                        {likes > 0 ? (
                          <View
                            testID={`gallery-tile-likes-${photo.key}`}
                            style={{
                              position: 'absolute',
                              left: 6,
                              bottom: 6,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 3,
                              paddingHorizontal: 5,
                              paddingVertical: 1,
                              borderRadius: theme.radius.chip,
                              backgroundColor: theme.colors.overlay,
                            }}
                          >
                            <Icon name="heart" size={11} color="onButton" fill="onButton" />
                            <Text
                              variant="caption"
                              color="onButton"
                              style={{ fontSize: 10, lineHeight: 14 }}
                            >
                              {`${likes}`}
                            </Text>
                          </View>
                        ) : null}
                      </Pressable>
                    )
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        </>
      )}

      {openIndex !== null && photos[openIndex] ? (
        <Lightbox
          photos={photos}
          startIndex={openIndex}
          spotTitle={spot?.title}
          topInset={insets.top}
          bottomInset={insets.bottom}
          width={window.width}
          onClose={() => setOpenIndex(null)}
          onOpenPost={(postId) => {
            setOpenIndex(null)
            navigation.navigate('PostDetail', { postId })
          }}
        />
      ) : null}
    </SafeAreaView>
  )
}

interface LightboxProps {
  photos: GalleryPhoto[]
  startIndex: number
  spotTitle?: string
  topInset: number
  bottomInset: number
  width: number
  onClose: () => void
  onOpenPost: (postId: string) => void
}

/**
 * One photo, whole, on a near-black ground (the canvas's `.lightbox`).
 *
 * Swipe to the next photo, as the gallery has let you since STOURIFY-201.
 * The foot says whose photo it is and, for a posted photo, opens that post.
 * Android's Back closes it, so Back from here still means "back to the grid",
 * and Back from the grid still means "back to the spot".
 *
 * The ground is the same in both themes: it frames a photograph, not the page.
 * It covers the status bar too, so its top row clears the status bar itself —
 * the trap STOURIFY-255 found on the old gallery header.
 */
function Lightbox({
  photos,
  startIndex,
  spotTitle,
  topInset,
  bottomInset,
  width,
  onClose,
  onOpenPost,
}: LightboxProps) {
  const theme = useTheme()
  const [index, setIndex] = useState(startIndex)
  const photo = photos[Math.min(index, photos.length - 1)]

  // FlatList refuses a viewability callback that changes between renders.
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0]
    if (first && typeof first.index === 'number') setIndex(first.index)
  }).current

  const white = { color: theme.colors.onButton }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View testID="gallery-lightbox" style={{ flex: 1, backgroundColor: theme.colors.lightbox }}>
        <View
          testID="gallery-lightbox-top"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingTop: topInset + theme.spacing[3],
            paddingHorizontal: 18,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="body" style={[white, { fontFamily: theme.fontFamily.bodySemiBold }]}>
              {photo.post ? 'Community photo' : 'Spot photo'}
            </Text>
            <Text variant="caption" style={[white, { opacity: 0.75 }]}>
              {`${index + 1} / ${photos.length}`}
            </Text>
          </View>
          <OverlayButton
            testID="gallery-lightbox-close"
            icon="close"
            accessibilityLabel="Close"
            onPress={onClose}
          />
        </View>

        <FlatList
          data={photos}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={startIndex}
          getItemLayout={(_, itemIndex) => ({
            length: width,
            offset: width * itemIndex,
            index: itemIndex,
          })}
          keyExtractor={(item) => item.key}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          style={{ flex: 1, marginVertical: 14 }}
          renderItem={({ item, index: itemIndex }) => (
            <Image
              testID={`gallery-photo-${itemIndex}`}
              source={{ uri: item.url }}
              style={{ width, height: '100%' }}
              contentFit="contain"
            />
          )}
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 18,
            paddingBottom: bottomInset + theme.spacing[5],
            minHeight: 44,
          }}
        >
          {photo.post ? (
            <>
              <Avatar
                uri={photo.post.author?.avatar_url}
                name={photo.post.author?.name}
                size={36}
              />
              <View style={{ flex: 1 }}>
                <Text
                  variant="body"
                  numberOfLines={1}
                  style={[white, { fontFamily: theme.fontFamily.bodySemiBold }]}
                >
                  {photo.post.author?.name ?? 'Explorer'}
                </Text>
                {photo.post.caption ? (
                  <Text variant="caption" numberOfLines={1} style={[white, { opacity: 0.75 }]}>
                    {photo.post.caption}
                  </Text>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => photo.post && onOpenPost(photo.post.uuid)}
                style={({ pressed }) => ({
                  minHeight: theme.minTouchTarget,
                  justifyContent: 'center',
                  paddingHorizontal: 14,
                  borderRadius: theme.radius.chip,
                  backgroundColor: theme.colors.lightboxControl,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  variant="caption"
                  style={[white, { fontFamily: theme.fontFamily.bodySemiBold }]}
                >
                  Open post
                </Text>
              </Pressable>
            </>
          ) : (
            <View style={{ flex: 1 }}>
              <Text
                variant="body"
                numberOfLines={1}
                style={[white, { fontFamily: theme.fontFamily.bodySemiBold }]}
              >
                {spotTitle ?? 'This spot'}
              </Text>
              <Text variant="caption" style={[white, { opacity: 0.75 }]}>
                From the spot’s own photos
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}
