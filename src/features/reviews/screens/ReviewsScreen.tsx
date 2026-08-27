import { useMemo } from 'react'
import { FlatList, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { HomeStackParamList } from '@/shared/navigation/types'
import { getSpotReviews } from '@/shared/api/reviews'
import { getSpot } from '@/shared/api/spots'
import {
  Avatar,
  Button,
  Card,
  Divider,
  EmptyState,
  Rating,
  Skeleton,
  ScreenHeader,
  Tag,
  Text,
} from '@/shared/components/ui'
import { useSpotReviews } from '@/features/reviews/hooks/useSpotReviews'
import { useAuthStore } from '@/shared/store/auth'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<HomeStackParamList, 'Reviews'>

/** The shape every row renders, whichever source it came from. */
interface ReviewRow {
  id: string
  rating: number
  body: string | null
  authorName: string
  authorUsername: string | null
  authorAvatarUrl: string | null
  isQueued: boolean
  createdAt: number
}

/**
 * Merges the local, possibly-still-queued `sto_reviews` rows
 * (`useSpotReviews`) with the server list (`getSpotReviews`), keyed on uuid
 * so a review that has already drained does not render twice. Newest first.
 *
 * "Helpful" votes are online-only — reactions are not a synced table, so
 * there is deliberately no offline path for them here.
 */
export default function ReviewsScreen({ route, navigation }: Props) {
  const { spotId } = route.params
  const theme = useTheme()
  const currentUser = useAuthStore((state) => state.user)

  const localReviews = useSpotReviews(spotId)

  /**
   * Whose reviews these are (STOURIFY-209).
   *
   * The SAME cache key the spot page and the photo gallery use, deliberately:
   * arriving here from a spot means the answer is already in hand, so naming
   * the spot costs nothing and cannot fail. Arriving some other way fetches it
   * once, and the heading simply has no second line until it lands.
   */
  const { data: spot } = useQuery({
    queryKey: ['spot', spotId],
    queryFn: () => getSpot(spotId),
  })

  const {
    data: serverData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['spot-reviews', spotId],
    queryFn: () => getSpotReviews(spotId),
  })

  const rows = useMemo<ReviewRow[]>(() => {
    const byId = new Map<string, ReviewRow>()

    for (const review of serverData?.data ?? []) {
      byId.set(review.uuid, {
        id: review.uuid,
        rating: review.rating,
        body: review.body,
        authorName: review.author?.name ?? 'Explorer',
        authorUsername: review.author?.username ?? null,
        authorAvatarUrl: review.author?.avatar_url ?? null,
        isQueued: false,
        createdAt: new Date(review.created_at).getTime(),
      })
    }

    for (const local of localReviews) {
      // A local row already reflected on the server (drained + pulled) loses
      // its queued badge automatically once `markSynced` runs; skip it here so
      // it does not render as a second, undated row on top of the server copy.
      if (byId.has(local.id) && !local.isQueued) continue

      byId.set(local.id, {
        id: local.id,
        rating: local.rating,
        body: local.body,
        authorName: currentUser?.name ?? 'You',
        authorUsername: null,
        authorAvatarUrl: null,
        isQueued: local.isQueued,
        createdAt: local.createdAt,
      })
    }

    return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt)
  }, [serverData, localReviews, currentUser])

  /**
   * Only reached with no rows to show — and "we are still asking", "we could
   * not ask" and "we asked and there is nothing" are three different facts
   * with three different remedies, so they get three different sentences
   * (STOURIFY-85). Until this card there was one sentence for all three, and
   * a failed request said the spot had no reviews: a claim about the spot,
   * made on the strength of a timeout.
   *
   * Two orderings here are load-bearing:
   *
   * **This lives inside `ListEmptyComponent`**, which only renders when the
   * list has no rows at all, so content always wins over an error. That
   * matters more here than on any sibling screen: `rows` merges the local
   * `sto_reviews` collection with the server list, so somebody who wrote a
   * review offline has their own words on screen while the server fetch is
   * failing. Hoisting an `isError` check above the `FlatList` would cover them
   * with a network message, and would never once show that it had, because the
   * branch is unreachable while online. `FeedScreen.tsx:106-132` documents this
   * at length.
   *
   * **`isLoading` is asked before `isError`.** `isLoading` is true only for a
   * first fetch with nothing cached, so a slow first load shows skeletons
   * rather than claiming a failure. `isError` then stays true through a retry
   * until one succeeds, which holds the failure message up while the retry is
   * in flight instead of flickering to the empty message and back. `isFetching`
   * was the alternative and loses for exactly that reason — a pressed "Try
   * again" would swap the message for skeletons and back.
   */
  const empty = isLoading ? (
    <View style={{ padding: theme.gutter, gap: theme.spacing[4] }}>
      <Skeleton height={120} />
      <Skeleton height={120} />
      <Skeleton height={120} />
    </View>
  ) : isError ? (
    <EmptyState
      icon="📡"
      title="Couldn't load the reviews"
      subtitle="We couldn't reach Stourify just now. Check your connection and try again."
      actionLabel="Try again"
      onAction={() => void refetch()}
    />
  ) : (
    <EmptyState icon="⭐" title="No reviews yet" subtitle="Be the first to write one." />
  )

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.surface }}
      edges={['top', 'bottom']}
    >
      <ScreenHeader
        testID="reviews-header"
        onBack={() => navigation.goBack()}
        title="Reviews"
        subtitle={spot?.title}
      />

      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{ padding: theme.gutter, gap: theme.spacing[3] }}
        ListEmptyComponent={empty}
        renderItem={({ item }) => (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
              <Avatar uri={item.authorAvatarUrl} name={item.authorName} size={36} />
              <View style={{ flex: 1 }}>
                <Text variant="h2" numberOfLines={1}>
                  {item.authorName}
                </Text>
                {item.authorUsername ? (
                  <Text variant="caption" color="muted">
                    @{item.authorUsername}
                  </Text>
                ) : null}
              </View>
              {item.isQueued ? <Tag label="Queued ↑" /> : null}
            </View>

            <View style={{ marginVertical: theme.spacing[2] }}>
              <Divider />
            </View>

            <Rating value={item.rating} compact />

            {item.body ? (
              <Text variant="body" style={{ marginTop: theme.spacing[2] }}>
                {item.body}
              </Text>
            ) : null}
          </Card>
        )}
      />

      {/*
        The way to add your own (STOURIFY-211). It used to sit on the spot page,
        one line under the rating row that leads here — the comment cards by the
        front door, the guest book in the back room. This is the page that shows
        you what other people wrote, so this is where the pen belongs.

        Pinned as a sibling of the `FlatList` rather than drawn inside it, and
        that placement is the whole decision. Inside, as a list header, it would
        scroll off the top — away from the one person most likely to press it,
        who is whoever just read to the bottom. Put only in the empty state's
        action slot, it would vanish the moment a spot had a single review.
        Outside the list it is on screen in all three states: loading, empty, and
        a list too long to fit.

        `edges` on the SafeAreaView above gained `'bottom'` for the same reason:
        a footer is the one thing on this screen the phone's gesture bar can sit
        on top of.
      */}
      <View style={{ padding: theme.gutter }}>
        <Button
          label="Write a review"
          fullWidth
          onPress={() => navigation.navigate('WriteReview', { spotId })}
        />
      </View>
    </SafeAreaView>
  )
}
