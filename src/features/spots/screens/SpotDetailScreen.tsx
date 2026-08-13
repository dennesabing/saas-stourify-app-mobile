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
          {hasFailed ? null : isWaiting ? (
            <Skeleton height={20} width="40%" />
          ) : (
            <Rating value={spot?.rating_average ?? 0} reviewCount={spot?.reviews_count ?? 0} />
          )}

          <View style={{ flexDirection: 'row', gap: theme.spacing[3] }}>
            <Button
              label={`See all ${spot?.reviews_count ?? 0} reviews`}
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

          <Button
            label={isSaved ? (isQueued ? 'Saved ↑' : 'Saved') : 'Save'}
            variant={isSaved ? 'secondary' : 'accent'}
            disabled={isSaved}
            onPress={onSave}
          />
        </View>

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
            <Text variant="caption" color="muted">
              {spot?.latitude?.toFixed(4)}, {spot?.longitude?.toFixed(4)}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
