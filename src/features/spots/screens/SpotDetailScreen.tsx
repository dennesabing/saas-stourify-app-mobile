import { useCallback, useState } from 'react'
import {
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  View,
  type ViewToken,
} from 'react-native'
import { Image } from 'expo-image'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { useDatabase } from '@nozbe/watermelondb/react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { HomeStackParamList } from '@/shared/navigation/types'
import { describeRequestFailure } from '@/shared/api/errorMessage'
import { getSpot, getSpotPosts } from '@/shared/api/spots'
import {
  Button,
  Card,
  EmptyState,
  HashtagText,
  Icon,
  OverlayButton,
  Rating,
  Skeleton,
  Tag,
  Text,
} from '@/shared/components/ui'
import type { IconName } from '@/shared/components/ui'
import type { Post } from '@/shared/api/types'
import { ratingFor } from '@/features/discover/api/exploreSpots'
import { createLocalWishlistItem } from '@/features/spots/api/createLocalWishlistItem'
import { openInMaps } from '@/features/spots/api/openInMaps'
import SpotAboutTab from '@/features/spots/components/SpotAboutTab'
import SpotReviewsTab from '@/features/spots/components/SpotReviewsTab'
import { useIsSpotSaved } from '@/features/spots/hooks/useIsSpotSaved'
import { useTheme } from '@/theme/ThemeProvider'
import { gutter } from '@/theme/tokens'

const { width } = Dimensions.get('window')
/** The canvas's `.mini-grid`: three columns, 4 apart, inside the page gutter. */
const GRID_GAP = 4
const THUMB = (width - gutter * 2 - GRID_GAP * 2) / 3
/** A hero page is exactly one screen wide, so `pagingEnabled` lands on photo boundaries. */
const SCREEN_WIDTH = width
/** The canvas's `.sp-hero` height. */
const HERO_HEIGHT = 330
const HERO_VIEWABILITY = { itemVisiblePercentThreshold: 60 }

type Props = NativeStackScreenProps<HomeStackParamList, 'SpotDetail'>
type SpotTab = 'About' | 'Photos' | 'Reviews'

/**
 * The design's three tabs, in its order. Its fourth, Events, has nothing
 * behind it — `docs/what-the-spot-page-leaves-out.md` says why.
 */
const TABS: SpotTab[] = ['About', 'Photos', 'Reviews']

/**
 * The Spot Hub landing screen — artboard 1, "Spot Profile", of
 * `docs/design/Stourify - Spot Hub.dc.html` (STOURIFY-292).
 *
 * Top to bottom: the swipeable photo with its counter and its round Back and
 * Save; the title block; Save and Directions; then About | Photos | Reviews.
 * Same data and the same behaviour as before, laid out the way the canvas
 * draws it.
 *
 * Wishlist save is a genuine offline-first WatermelonDB write
 * (`createLocalWishlistItem`), NOT a React Query mutation: `sto_wishlist_items`
 * is a synced pushable table, same pattern as `createLocalReview`.
 */
export default function SpotDetailScreen({ route, navigation }: Props) {
  const { spotId, tab: initialTab } = route.params
  const theme = useTheme()
  const database = useDatabase()
  /*
   * Opens on About, the design's default (STOURIFY-292; it opened on Posts
   * before). A deep link (`stourify://spot/<uuid>?tab=photos`) is the only
   * thing that passes anything else — see `shared/navigation/linking.ts`.
   */
  const [tab, setTab] = useState<SpotTab>(initialTab ?? 'About')
  /** Which hero photo is showing, so the counter can say so. */
  const [heroIndex, setHeroIndex] = useState(0)

  const onHeroViewableChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0]
    if (typeof first?.index === 'number') setHeroIndex(first.index)
  }, [])

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

  const { data: postsData } = useQuery({
    queryKey: ['spot-posts', spotId],
    queryFn: () => getSpotPosts(spotId),
  })

  const { isSaved, isQueued } = useIsSpotSaved(spotId)

  /**
   * The two flags every stuck placeholder on this screen used to be missing.
   *
   * They are computed once, together, so they cannot overlap and cannot drift:
   * the bug this replaces existed in two places precisely because
   * `isLoading || !spot` was written out twice and both copies were wrong in
   * the same way (STOURIFY-64).
   *
   * **`&& !spot` is the load-bearing half.** React Query keeps serving a
   * cached spot while a background refetch fails, so `isError` alone is true
   * in the one situation where the reader is happily looking at content —
   * offline, on a spot they opened yesterday. Reaching for the error panel
   * there would take a readable spot off the screen to announce that no spot
   * could be fetched. `DiscoverScreen` and `FeedScreen` carry the same warning
   * for their lists; this is that rule for a screen holding one object.
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
  const failure = describeRequestFailure(error, 'this spot')

  const posts = postsData?.data ?? []
  const media = spot?.media ?? []
  const categories = spot?.categories ?? []
  const title = spot?.title ?? '...'
  /**
   * Stars only when somebody has actually reviewed the spot. The server sends
   * `rating_average: 0` for a spot nobody has rated, and "★ 0.0" reads as
   * "rated terribly" — `ratingFor` is the app's one rule for that (STOURIFY-259).
   */
  const rating = spot ? ratingFor(spot) : null

  /**
   * The spot's position, or `null` when the server did not send one — a
   * contributor who turned off `shows_location_on_spots` has both keys
   * withheld from everybody else (STOURIFY-185, STOURIFY-240).
   *
   * Resolved once, here, rather than checked again inside the JSX. A `typeof`
   * guard written in the markup narrows the expression it guards and nothing
   * else: the `onPress` handlers below are closures, and TypeScript rightly
   * refuses to assume `spot.latitude` is still a number by the time somebody
   * taps. One `const` makes the narrowing outlive the branch.
   *
   * `typeof === 'number'` and never truthiness — latitude 0 is the equator and
   * longitude 0 is Greenwich, both real places (STOURIFY-65).
   */
  const coordinate =
    typeof spot?.latitude === 'number' && typeof spot?.longitude === 'number'
      ? { latitude: spot.latitude, longitude: spot.longitude }
      : null

  const openDirections = () => {
    if (!coordinate) return
    void openInMaps(coordinate.latitude, coordinate.longitude, spot?.title)
  }

  const onSave = useCallback(async () => {
    if (isSaved) return
    await createLocalWishlistItem(database, { spotId: null, spotUuid: spotId })
  }, [database, isSaved, spotId])

  const renderThumb = (item: Post) => (
    <Pressable
      key={item.uuid}
      testID="spot-post-thumb"
      accessibilityRole="button"
      accessibilityLabel="Open this post"
      onPress={() => navigation.navigate('PostDetail', { postId: item.uuid })}
      style={{
        width: THUMB,
        height: THUMB,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: theme.colors.surfaceAlt,
      }}
    >
      {item.media?.[0]?.url ? (
        <Image
          source={{ uri: item.media[0].url }}
          style={{ width: THUMB, height: THUMB }}
          contentFit="cover"
        />
      ) : null}
    </Pressable>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      {/*
        The Note composer at the bottom of the About tab is the reason this is
        here. Under edge-to-edge Android no longer shrinks the window when the
        keyboard opens, so the keyboard is simply drawn on top of whatever was
        at the bottom of the screen — and the thing at the bottom of this screen
        is the box you are typing into (STOURIFY-196).

        `KeyboardAvoidingView` measures the overlap and lifts its contents clear
        of it, which is what lets the ScrollView scroll the composer into view.
        `CommentsScreen` and `PostComposeScreen` solve the identical problem the
        identical way; if you change one, look at all three.
      */}
      <KeyboardAvoidingView
        testID="spot-detail-keyboard-avoider"
        style={{ flex: 1 }}
        behavior="padding"
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: theme.spacing[7] }}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            {/*
            A request that came back broken gets words and a button, not a shape
            that pulses forever. Before STOURIFY-64 a failed fetch left the hero
            and the rating as grey placeholders with no message and no way out —
            a lift button that lights up and stays lit.

            The panel REPLACES the hero rather than rendering inside it, because
            `EmptyState` contains a `Button` and a touch target nested inside
            another touch target is an arrangement that works until a platform
            decides otherwise. There is nothing to open in this state anyway.
          */}
            {hasFailed ? (
              <View
                testID="spot-hero-error"
                style={{
                  minHeight: HERO_HEIGHT,
                  justifyContent: 'center',
                  backgroundColor: theme.colors.surfaceAlt,
                }}
              >
                <EmptyState
                  icon={failure.icon}
                  title={failure.title}
                  subtitle={failure.subtitle}
                  actionLabel="Try again"
                  onAction={() => void refetch()}
                />
              </View>
            ) : (
              <Pressable
                testID="spot-hero"
                accessibilityRole="button"
                accessibilityLabel="View photos"
                onPress={() => navigation.navigate('PhotoGallery', { spotId })}
                disabled={media.length === 0}
              >
                {/*
                Three states, and the ORDER is the fix. `media` is `spot?.media ?? []`,
                so it is empty both for a spot with no photos and for a spot nobody has
                heard back about yet. Asking "are there photos?" first answered the
                second case with the first case's sentence — "No photos yet" over a spot
                that may well have twenty (STOURIFY-63). Ask "has it arrived?" first and
                the two facts stop sharing an answer.
              */}
                {isWaiting ? (
                  <View testID="spot-hero-loading">
                    <Skeleton height={HERO_HEIGHT} radius={0} />
                  </View>
                ) : media.length > 0 ? (
                  /*
                    Every photo, swipeable, rather than the first one and a hint
                    that there might be others (STOURIFY-201). Tapping still opens
                    the full-screen gallery: this is the preview, that is the
                    reading room.

                    `scrollEnabled` is off for a single photo so the one-photo
                    case cannot be dragged around, which reads as broken rather
                    than as "there is only one".
                  */
                  <View>
                    <FlatList
                      testID="spot-hero-pager"
                      data={media}
                      horizontal
                      pagingEnabled
                      scrollEnabled={media.length > 1}
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={(photo) => photo.uuid}
                      onViewableItemsChanged={onHeroViewableChanged}
                      viewabilityConfig={HERO_VIEWABILITY}
                      renderItem={({ item: photo }) => (
                        <Image
                          testID="spot-hero-image"
                          source={{ uri: photo.url }}
                          style={{
                            width: SCREEN_WIDTH,
                            height: HERO_HEIGHT,
                            backgroundColor: theme.colors.surfaceAlt,
                          }}
                          contentFit="cover"
                          transition={theme.motion.fast}
                        />
                      )}
                    />

                    {/*
                      The canvas's "1 / N" (`.pc`), where STOURIFY-201 drew dots.
                      A number says how many there are, which a row of dots stops
                      doing at about six. On a single photo it says "1 / 1": the
                      truth, and no promise of a second one to swipe to.
                    */}
                    <View
                      testID="spot-hero-counter"
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        bottom: 14,
                        right: 14,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        paddingHorizontal: 11,
                        paddingVertical: 6,
                        borderRadius: theme.radius.chip,
                        backgroundColor: theme.colors.overlayStrong,
                      }}
                    >
                      <Icon name="camera" size={13} color="onButton" />
                      <Text
                        variant="caption"
                        color="onButton"
                        style={{ fontFamily: theme.fontFamily.bodySemiBold }}
                      >
                        {/*
                          Clamped, because a link to another spot can reuse
                          this screen with the last spot's index still in
                          state — "4 / 1" is worse than no counter at all.
                        */}
                        {`${Math.min(heroIndex, media.length - 1) + 1} / ${media.length}`}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View
                    style={{
                      width: '100%',
                      height: HERO_HEIGHT,
                      backgroundColor: theme.colors.surfaceAlt,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: theme.spacing[1],
                    }}
                  >
                    <Text variant="h2" color="muted">
                      🖼
                    </Text>
                    <Text variant="body" color="muted">
                      No photos yet
                    </Text>
                  </View>
                )}
              </Pressable>
            )}

            {/*
              Back and Save, as the canvas's round dark discs on the photo.

              They are SIBLINGS of the hero, not children of it, and float over
              it from here. The hero is itself a button that opens the gallery,
              and a touch target inside another touch target is an arrangement
              that works right up until a platform decides otherwise
              (STOURIFY-197).

              The canvas also draws Share beside Save. A spot has no public web
              address to share, so it is left out (STOURIFY-301 owns it).
            */}
            <View
              pointerEvents="box-none"
              style={{
                position: 'absolute',
                top: theme.spacing[3],
                left: 14,
                right: 14,
                zIndex: 10,
                flexDirection: 'row',
                justifyContent: 'space-between',
              }}
            >
              <OverlayButton
                icon="back"
                accessibilityLabel="Back"
                onPress={() => navigation.goBack()}
              />

              {hasFailed ? null : (
                <OverlayButton
                  testID="spot-save"
                  icon="bookmark"
                  filled={isSaved}
                  accessibilityLabel={
                    isSaved ? (isQueued ? 'Saved, waiting to sync' : 'Saved') : 'Save this spot'
                  }
                  selected={isSaved}
                  disabled={isSaved}
                  onPress={onSave}
                />
              )}
            </View>
          </View>

          {/*
          Nothing in this block survives a failed request, and that is one
          decision rather than five. Every child of it either states a fact
          about the spot — its name, its Verified tag, its categories, its
          rating — or acts on the spot: save it, go there. With no spot and
          nothing cached, none of them has anything true to say, and there is
          no second source that could fill any of them in (STOURIFY-65).

          The line this stops at is the tabs below, whose Photos tab is fed by a
          SEPARATE request (`getSpotPosts`) that may well have succeeded.
          Hiding posts that loaded fine, because the spot's own details did
          not, is the same mistake as covering a cached spot — STOURIFY-64
          rejected exactly that.

          It sits UNDER the photo, where the canvas prints it on the photo over
          a dark scrim: the rating line below is a button, the photo is a
          button, and one inside the other is the nesting rule above. Text on a
          contributor's photo is also only legible until somebody photographs a
          pale sky (STOURIFY-292, ASSUMPTION note).
        */}
          {hasFailed ? null : (
            <View
              style={{
                paddingHorizontal: theme.gutter,
                paddingTop: theme.spacing[4],
                gap: theme.spacing[2],
              }}
            >
              {categories.length > 0 || spot?.is_verified ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {categories.map((category) => (
                    <Tag key={category} label={category} />
                  ))}
                  {spot?.is_verified ? <Tag label="✓ Verified" /> : null}
                </View>
              ) : null}

              <Text variant="display" numberOfLines={2}>
                {title}
              </Text>

              {/*
                "★★★★★ 4.8 · 212 reviews · Kadayawan Hills", the canvas's `.rt`
                line. It stays the way into the reviews (STOURIFY-197), and the
                chevron is what makes it look like one: a rating that silently
                became tappable would be a rating nobody ever pressed.

                The row renders in the waiting state too, with a skeleton for
                the rating, so the buttons under it do not arrive late and shift
                everything down once the request lands.
              */}
              <Pressable
                testID="spot-rating-row"
                accessibilityRole="button"
                accessibilityLabel="See all reviews"
                disabled={isWaiting}
                onPress={() => navigation.navigate('Reviews', { spotId })}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing[2],
                  minHeight: theme.minTouchTarget,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing[1],
                  }}
                >
                  {isWaiting ? (
                    <Skeleton height={20} width="40%" />
                  ) : rating !== null ? (
                    <Rating value={rating} reviewCount={spot?.reviews_count} />
                  ) : (
                    <Text variant="caption" color="muted">
                      No reviews yet
                    </Text>
                  )}

                  {!isWaiting && spot?.address ? (
                    <Text
                      variant="caption"
                      color="muted"
                      numberOfLines={1}
                      style={{ flexShrink: 1 }}
                    >
                      {`· ${spot.address}`}
                    </Text>
                  ) : null}
                </View>

                {isWaiting ? null : <Icon name="forward" size={18} color="muted" />}
              </Pressable>
            </View>
          )}

          {/*
            Save and Directions, the canvas's `.sp-act` row. Its middle button,
            Share, is left out for the reason on the photo above.

            Save here and the mark on the photo are one action drawn twice, so
            they write the same wishlist row and both read "saved" from the same
            hook. Directions hands off to the phone's own map app, and is only
            drawn when there is a position to hand it — a contributor can hide
            theirs (STOURIFY-185).
          */}
          {hasFailed ? null : (
            <View
              testID="spot-actions"
              style={{
                flexDirection: 'row',
                gap: 9,
                paddingHorizontal: theme.gutter,
                paddingTop: 14,
                paddingBottom: 6,
              }}
            >
              <ActionButton
                testID="spot-save-action"
                icon={isQueued ? 'sync' : 'bookmark'}
                iconTestID={isQueued ? 'spot-save-queued' : undefined}
                label={isSaved ? 'Saved' : 'Save'}
                selected={isSaved}
                disabled={isSaved}
                onPress={onSave}
              />
              {coordinate ? (
                <ActionButton
                  testID="spot-directions"
                  icon="navigate"
                  label="Directions"
                  primary
                  accessibilityHint="Opens your map app at this location"
                  onPress={openDirections}
                />
              ) : null}
            </View>
          )}

          <View
            accessibilityRole="tablist"
            style={{
              flexDirection: 'row',
              gap: 2,
              paddingHorizontal: 14,
              paddingTop: theme.spacing[3],
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.hairline,
            }}
          >
            {TABS.map((t) => (
              <Pressable
                key={t}
                accessibilityRole="tab"
                accessibilityLabel={t}
                accessibilityState={{ selected: tab === t }}
                onPress={() => setTab(t)}
                style={{
                  flex: 1,
                  minHeight: theme.minTouchTarget,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderBottomWidth: tab === t ? 2 : 0,
                  borderBottomColor: theme.colors.primary,
                }}
              >
                <Text
                  variant="caption"
                  color={tab === t ? 'primary' : 'muted'}
                  style={{ fontFamily: theme.fontFamily.bodySemiBold }}
                >
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === 'About' ? (
            <View
              style={{
                paddingHorizontal: theme.gutter,
                paddingTop: theme.spacing[4],
                gap: theme.spacing[3],
              }}
            >
              {/*
              The description is the only text on this tab written by whoever
              added the spot; everything below it was pinned up by other
              visitors since. Drawn bare it read as neither -- the museum label
              without its brass plate (STOURIFY-213) -- so it gets the app's own
              flat surface to sit on.

              Note the Card is INSIDE the truthy branch, not around the ternary.
              Around it, every spot without a description would render an empty
              bordered rectangle -- a label with nothing on it.
            */}
              {spot?.description ? (
                <Card raised={false} testID="spot-description">
                  <HashtagText
                    variant="body"
                    text={spot.description}
                    onPressHashtag={(slug) => navigation.navigate('Tag', { slug })}
                  />
                </Card>
              ) : null}

              {/*
                Where this place is, and a way to go there: the canvas's
                Location row and map card.

                Three states, one at a time. A coordinate gives the tappable
                map card. An address alone — a contributor hid the position
                (STOURIFY-185) — gives a plain row that is NOT tappable, because
                a control that looks openable and does nothing is worse than
                text. Neither gives one plain line (STOURIFY-240), which says
                what happened and not why: absence carries no reason with it.

                With no spot at all (a failed request) all three are skipped —
                there is nothing true to say about where an unknown place is.
              */}
              {coordinate ? (
                <MapCard
                  title={spot?.title}
                  address={spot?.address}
                  latitude={coordinate.latitude}
                  longitude={coordinate.longitude}
                  onPress={openDirections}
                />
              ) : spot?.address ? (
                <LocationRow testID="spot-location-static" value={spot.address} />
              ) : spot ? (
                <LocationRow testID="spot-location-hidden" value="Location not shown" muted />
              ) : null}

              {/*
              The corkboard, hung beside the plaque above rather than over it
              (STOURIFY-147): notes other visitors have pinned up, most-liked
              first.

              It is fed by its OWN request, so it is deliberately outside the
              `hasFailed` rule that hides the details block: a spot whose details
              could not be fetched may still have notes that arrived perfectly
              well, and hiding them would repeat the mistake STOURIFY-64 fixed
              for the posts grid.
            */}
              <Text
                variant="body"
                style={{ fontFamily: theme.fontFamily.displayBold, marginTop: theme.spacing[1] }}
              >
                Notes from visitors
              </Text>
              <SpotAboutTab
                spotUuid={spotId}
                onOpenThread={(about) =>
                  navigation.navigate('Comments', {
                    spotAboutId: about.uuid,
                    // Everything the thread screen needs to say what it is showing.
                    // It is all already on this screen, so passing it costs a
                    // request and a failure mode less than re-fetching it there.
                    spotTitle: spot?.title,
                    noteBody: about.body,
                    noteAuthor: about.author?.name,
                  })
                }
              />
            </View>
          ) : tab === 'Photos' ? (
            /*
              The posts people shared here, in the canvas's rounded tiles — the
              tab was called Posts until STOURIFY-292, and to a visitor they are
              the photos. Then the way into the spot's own photo gallery.

              "Nobody has shared a photo" is said only when there is truly
              nothing: no posts, and no photos on the spot either. With photos
              on the spot the gallery button is the answer, and a sentence
              denying photos above it would contradict the page.
            */
            <View
              style={{
                paddingHorizontal: theme.gutter,
                paddingTop: theme.spacing[3],
                gap: theme.spacing[3],
              }}
            >
              {posts.length > 0 ? (
                <View
                  testID="spot-photos-grid"
                  style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}
                >
                  {posts.map(renderThumb)}
                </View>
              ) : postsData && media.length === 0 && !isWaiting ? (
                <Text testID="spot-photos-empty" variant="body" color="muted">
                  Nobody has shared a photo here yet.
                </Text>
              ) : null}

              {media.length > 0 ? (
                <Button
                  label={media.length === 1 ? 'View the photo' : `View all ${media.length} photos`}
                  variant="secondary"
                  fullWidth
                  onPress={() => navigation.navigate('PhotoGallery', { spotId })}
                />
              ) : null}
            </View>
          ) : (
            <View style={{ paddingHorizontal: theme.gutter, paddingTop: theme.spacing[3] }}>
              <SpotReviewsTab
                spotUuid={spotId}
                reviewsCount={spot?.reviews_count}
                onOpenReviews={() => navigation.navigate('Reviews', { spotId })}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

interface ActionButtonProps {
  label: string
  icon: IconName
  onPress: () => void
  /** The canvas's slate-filled button — Directions. */
  primary?: boolean
  /** Drawn in the brand colour once done — a saved Save (`.sp-act button.on`). */
  selected?: boolean
  disabled?: boolean
  accessibilityHint?: string
  iconTestID?: string
  testID?: string
}

/**
 * One button of the canvas's action row: an icon over a short label, on a card
 * with a hairline edge, 50 tall. Local to this screen because nothing else in
 * the app draws the shape yet.
 */
function ActionButton({
  label,
  icon,
  onPress,
  primary = false,
  selected = false,
  disabled,
  accessibilityHint,
  iconTestID,
  testID,
}: ActionButtonProps) {
  const theme = useTheme()
  const tint = primary ? 'onButton' : selected ? 'primary' : 'ink'

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 50,
        borderRadius: theme.radius.button,
        borderWidth: 1,
        borderColor: primary
          ? theme.colors.button
          : selected
            ? theme.colors.primary
            : theme.colors.hairline,
        backgroundColor: primary ? theme.colors.button : theme.colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {/* The icon set drops a testID, so the wrapper carries it. */}
      <View testID={iconTestID}>
        <Icon
          name={icon}
          size={20}
          color={tint}
          fill={selected && icon === 'bookmark' ? 'primary' : undefined}
        />
      </View>
      <Text variant="caption" color={tint} style={{ fontFamily: theme.fontFamily.bodySemiBold }}>
        {label}
      </Text>
    </Pressable>
  )
}

interface MapCardProps {
  title?: string
  address?: string
  latitude: number
  longitude: number
  onPress: () => void
}

/**
 * The canvas's `.map-snip` and Location row, as one tappable card that opens
 * the phone's map app.
 *
 * The map is DRAWN, not loaded: a brand-tinted panel with a pin. A real map
 * tile would add a Google Maps load to every spot opened and show nothing
 * offline, where this page otherwise works (STOURIFY-292, ASSUMPTION note). The
 * coordinate is printed under the address, because six decimal places are what
 * a person can paste somewhere else.
 */
function MapCard({ title, address, latitude, longitude, onPress }: MapCardProps) {
  const theme = useTheme()

  return (
    <Pressable
      testID="spot-location"
      accessibilityRole="button"
      accessibilityLabel={`Open ${title ?? 'this spot'} in maps`}
      accessibilityHint="Opens your map app at this location"
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.colors.hairline,
        backgroundColor: theme.colors.card,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        style={{
          height: 110,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.badgeBg,
        }}
      >
        <Icon name="pin" size={34} color="accent" strokeWidth={2.2} />
        <View
          style={[
            {
              position: 'absolute',
              right: 10,
              bottom: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: theme.spacing[3],
              paddingVertical: theme.spacing[2],
              borderRadius: theme.radius.chip,
              backgroundColor: theme.colors.card,
            },
            theme.elevation.raised,
          ]}
        >
          <Icon name="navigate" size={13} color="primary" />
          <Text
            variant="caption"
            color="primary"
            style={{ fontFamily: theme.fontFamily.bodySemiBold }}
          >
            Get directions
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
        <Icon name="pin" size={19} color="primary" />
        <View style={{ flex: 1 }}>
          <Text variant="micro" color="muted">
            Location
          </Text>
          {address ? (
            <Text variant="body" numberOfLines={2}>
              {address}
            </Text>
          ) : null}
          <Text testID="spot-coordinates" variant="caption" color="muted">
            {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

/** The canvas's `.info-row`, for a Location that cannot be opened. */
function LocationRow({
  value,
  muted = false,
  testID,
}: {
  value: string
  muted?: boolean
  testID: string
}) {
  const theme = useTheme()

  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 13,
        borderRadius: theme.radius.button,
        borderWidth: 1,
        borderColor: theme.colors.hairline,
        backgroundColor: theme.colors.card,
      }}
    >
      <Icon name="pin" size={19} color="muted" />
      <View style={{ flex: 1 }}>
        <Text variant="micro" color="muted">
          Location
        </Text>
        <Text variant="body" color={muted ? 'muted' : 'ink'} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  )
}
