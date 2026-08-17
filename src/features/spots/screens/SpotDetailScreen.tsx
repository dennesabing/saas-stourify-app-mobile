import { useCallback, useState } from 'react'
import { Dimensions, FlatList, Pressable, ScrollView, View } from 'react-native'
import { Image } from 'expo-image'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { useDatabase } from '@nozbe/watermelondb/react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { HomeStackParamList } from '@/shared/navigation/types'
import { getSpot, getSpotPosts } from '@/shared/api/spots'
import { Button, EmptyState, Rating, Skeleton, Tag, Text } from '@/shared/components/ui'
import type { Post } from '@/shared/api/types'
import { createLocalWishlistItem } from '@/features/spots/api/createLocalWishlistItem'
import { useIsSpotSaved } from '@/features/spots/hooks/useIsSpotSaved'
import { useTheme } from '@/theme/ThemeProvider'

const { width } = Dimensions.get('window')
const THUMB = (width - 4) / 3
const HERO_HEIGHT = 240

type Props = NativeStackScreenProps<HomeStackParamList, 'SpotDetail'>

/**
 * The Spot Hub landing screen — rebuilt on the design system.
 *
 * Wishlist save is a genuine offline-first WatermelonDB write
 * (`createLocalWishlistItem`), NOT a React Query mutation: `sto_wishlist_items`
 * is a synced pushable table, same pattern as `createLocalReview`.
 */
export default function SpotDetailScreen({ route, navigation }: Props) {
  const { spotId } = route.params
  const theme = useTheme()
  const database = useDatabase()
  const [tab, setTab] = useState<'Posts' | 'About'>('Posts')

  const { data: spot, isLoading, isError, refetch } = useQuery({
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

  const posts = postsData?.data ?? []
  const media = spot?.media ?? []
  const categories = spot?.categories ?? []
  const title = spot?.title ?? '...'

  const onSave = useCallback(async () => {
    if (isSaved) return
    await createLocalWishlistItem(database, { spotId: null, spotUuid: spotId })
  }, [database, isSaved, spotId])

  const renderThumb = useCallback(
    ({ item }: { item: Post }) => (
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('PostDetail', { postId: item.uuid })}
      >
        {item.media?.[0]?.url ? (
          <Image source={{ uri: item.media[0].url }} style={{ width: THUMB, height: THUMB }} contentFit="cover" />
        ) : (
          <View style={{ width: THUMB, height: THUMB, backgroundColor: theme.colors.surfaceAlt }} />
        )}
      </Pressable>
    ),
    [navigation, theme.colors.surfaceAlt],
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing[7] }}>
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
            style={{ minHeight: HERO_HEIGHT, backgroundColor: theme.colors.surfaceAlt }}
          >
            <EmptyState
              icon="📡"
              title="Couldn't load this spot"
              subtitle="We couldn't reach Stourify just now. Check your connection and try again."
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

              The test is `isWaiting`, matching the rating below rather than inventing
              a second opinion: two elements fed by one query must not disagree about
              whether that query has come back.
            */}
            {isWaiting ? (
              <View testID="spot-hero-loading">
                <Skeleton height={HERO_HEIGHT} radius={0} />
              </View>
            ) : media.length > 0 ? (
              <Image
                testID="spot-hero-image"
                source={{ uri: media[0].url }}
                style={{ width: '100%', height: HERO_HEIGHT, backgroundColor: theme.colors.surfaceAlt }}
                contentFit="cover"
                transition={theme.motion.fast}
              />
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
          Nothing in this block survives a failed request, and that is one
          decision rather than five. Every child of it either states a fact
          about the spot — its name, its Verified tag, its categories, its
          rating — or acts on the spot: see its reviews, write one, save it.
          With no spot and nothing cached, none of them has anything true to
          say, and there is no second source that could fill any of them in.

          Before STOURIFY-65 they rendered their `??` fallbacks under the error
          panel: a title of "...", a "See all 0 reviews" button, and two
          buttons offering to review and bookmark a place the app had just
          admitted it could not identify.

          The line this stops at is the block below, which is fed by a
          SEPARATE request (`getSpotPosts`) that may well have succeeded.
          Hiding posts that loaded fine, because the spot's own details did
          not, is the same mistake as covering a cached spot — STOURIFY-64
          rejected exactly that, and this card does not reopen it.
        */}
        {hasFailed ? null : (
          <View style={{ padding: theme.gutter, gap: theme.spacing[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
              <Text variant="h1" style={{ flex: 1 }} numberOfLines={2}>
                {title}
              </Text>
              {spot?.status === 'active' && <Tag label="✓ Verified" />}
            </View>
  
            {categories.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[1] }}>
                {categories.map((category) => (
                  <Tag key={category} label={category} />
                ))}
              </View>
            )}
  
            {/*
              Nothing at all in the failed state, rather than a second failure
              message six lines under the first. One request went wrong; two
              notices about it read as two separate faults. What matters is that
              the skeleton goes: it carries `accessibilityLabel="Loading"`, so a
              skeleton nobody can resolve keeps announcing a request that
              finished — badly — minutes ago.
            */}
            {/*
              The rating and Save share one line, the way a shelf edge carries
              both a price and the button you press to take the item
              (STOURIFY-102). Save used to be a full-width row of its own below
              the review buttons, with the whole right-hand side of this line
              left empty.

              The row renders in the waiting state too, with a skeleton standing
              in for the rating, so Save does not appear late and shift
              everything under it downwards once the request lands.
            */}
            <View
              testID="spot-rating-row"
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}
            >
              <View style={{ flex: 1 }}>
                {isWaiting ? (
                  <Skeleton height={20} width="40%" />
                ) : (
                  <Rating value={spot?.rating_average ?? 0} reviewCount={spot?.reviews_count ?? 0} />
                )}
              </View>
              <Button
                icon="🔖"
                label={isSaved ? (isQueued ? 'Saved ↑' : 'Saved') : 'Save'}
                variant={isSaved ? 'secondary' : 'accent'}
                disabled={isSaved}
                onPress={onSave}
              />
            </View>

            {/*
              The count is gone from this label on purpose. At half the row's
              width there is room for about fifteen characters, and
              "See all 12 reviews" is eighteen — so it either wrapped onto a
              second line (the reported defect) or would now be cut short by an
              ellipsis. The number is already one line above, in the rating row's
              "· 12 reviews", so nothing is lost by saying it once.
            */}
            <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
              <Button
                label="See all reviews"
                variant="secondary"
                onPress={() => navigation.navigate('Reviews', { spotId })}
                style={{ flex: 1 }}
              />
              <Button
                label="Write a review"
                variant="secondary"
                onPress={() => navigation.navigate('WriteReview', { spotId })}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}

        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.colors.hairline }}>
          {(['Posts', 'About'] as const).map((t) => (
            <Pressable
              key={t}
              accessibilityRole="button"
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
              <Text variant="body" color={tab === t ? 'primary' : 'muted'}>
                {t}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'Posts' ? (
          <FlatList
            data={posts}
            numColumns={3}
            keyExtractor={(p) => p.uuid}
            renderItem={renderThumb}
            contentContainerStyle={{ gap: 2 }}
            columnWrapperStyle={{ gap: 2 }}
            scrollEnabled={false}
          />
        ) : (
          <View style={{ padding: theme.gutter, gap: theme.spacing[2] }}>
            {spot?.description ? <Text variant="body">{spot.description}</Text> : null}
            {spot?.address ? (
              <Text variant="caption" color="muted">
                📍 {spot.address}
              </Text>
            ) : null}
            {/*
              Only draw a coordinate when there is one. `spot?.latitude?.toFixed(4)`
              cannot throw on an absent number, but it cannot suppress the rest
              of the line either: React drops the `undefined` and renders the
              comma that was sitting between the two of them, so a spot that
              failed to load — and a spot that simply has no coordinates —
              showed a lone ", " under the address (STOURIFY-65).

              `typeof … === 'number'` rather than a truthiness check, because
              latitude 0 is the equator and longitude 0 is Greenwich. Both are
              real coordinates, and a `spot?.latitude && …` guard would hide
              them as though they were missing.
            */}
            {typeof spot?.latitude === 'number' && typeof spot?.longitude === 'number' ? (
              <Text testID="spot-coordinates" variant="caption" color="muted">
                {spot.latitude.toFixed(4)}, {spot.longitude.toFixed(4)}
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
