import { useMemo } from 'react'
import { FlatList, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { HomeStackParamList } from '@/shared/navigation/types'
import { describeRequestFailure } from '@/shared/api/errorMessage'
import { getSpotReviews } from '@/shared/api/reviews'
import { getSpot } from '@/shared/api/spots'
import {
  Avatar,
  BarHeader,
  Button,
  EmptyState,
  Icon,
  Skeleton,
  Tag,
  Text,
} from '@/shared/components/ui'
import { ratingFor } from '@/features/discover/api/exploreSpots'
import { useMarkHelpful } from '@/features/reviews/hooks/useMarkHelpful'
import { useSpotReviews } from '@/features/reviews/hooks/useSpotReviews'
import { useAuthStore } from '@/shared/store/auth'
import { formatRelativeTime } from '@/shared/utils/relativeTime'
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
  /**
   * Whether this row came from the server's list. Only those can take a
   * "Helpful" vote: a review still on the phone has no server copy to vote on.
   */
  onServer: boolean
  helpfulCount: number
  markedHelpful: boolean
  createdAt: number
}

/**
 * A spot's reviews, in the Spot Hub design's Reviews artboard (STOURIFY-293):
 * a rating summary, the review cards, and "Write a review" pinned underneath.
 *
 * Merges the local, possibly-still-queued `sto_reviews` rows
 * (`useSpotReviews`) with the server list (`getSpotReviews`), keyed on uuid
 * so a review that has already drained does not render twice. Newest first.
 *
 * "Helpful" votes are online-only — reactions are not a synced table, so
 * there is deliberately no offline path for them (`useMarkHelpful`).
 *
 * What the artboard draws with nothing behind it — the 5-to-1 bars, the star
 * filter chips, Reply, photos on a review, explorer ranks — is left out, and
 * `mobile/docs/what-the-spot-subscreens-leave-out.md` says why for each.
 */
export default function ReviewsScreen({ route, navigation }: Props) {
  const { spotId } = route.params
  const theme = useTheme()
  const currentUser = useAuthStore((state) => state.user)

  const localReviews = useSpotReviews(spotId)
  const helpful = useMarkHelpful(spotId)

  /**
   * Whose reviews these are (STOURIFY-209), and the rating the summary shows.
   *
   * The SAME cache key the spot page and the photo gallery use, deliberately:
   * arriving here from a spot means the answer is already in hand, so naming
   * the spot costs nothing and cannot fail. Arriving some other way fetches it
   * once, and the header simply has no second line until it lands.
   */
  const { data: spot } = useQuery({
    queryKey: ['spot', spotId],
    queryFn: () => getSpot(spotId),
  })

  const {
    data: serverData,
    error,
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
        onServer: true,
        helpfulCount: review.helpful_count ?? 0,
        markedHelpful: review.marked_helpful === true,
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
        onServer: false,
        helpfulCount: local.helpfulCount,
        markedHelpful: false,
        createdAt: local.createdAt,
      })
    }

    return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt)
  }, [serverData, localReviews, currentUser])

  /**
   * `null` for a spot nobody has rated: the server sends `rating_average: 0`
   * then, and a big "0.0" reads as "rated terribly" (`ratingFor`,
   * STOURIFY-259). No summary is drawn at all in that case.
   */
  const rating = spot ? ratingFor(spot) : null
  const reviewsCount = spot?.reviews_count ?? 0

  /**
   * Only reached with no rows to show — and "we are still asking", "we could
   * not ask" and "we asked and there is nothing" are three different facts
   * with three different remedies, so they get three different sentences
   * (STOURIFY-85).
   *
   * Two orderings here are load-bearing:
   *
   * **This lives inside `ListEmptyComponent`**, which only renders when the
   * list has no rows at all, so content always wins over an error. `rows`
   * merges the local `sto_reviews` collection with the server list, so
   * somebody who wrote a review offline has their own words on screen while
   * the server fetch is failing; an `isError` check above the list would
   * cover them with a network message. `FeedScreen.tsx` documents this.
   *
   * **`isLoading` is asked before `isError`.** `isLoading` is true only for a
   * first fetch with nothing cached, so a slow first load shows skeletons
   * rather than claiming a failure, and a pressed "Try again" holds the
   * failure message instead of flickering to skeletons and back.
   *
   * The wording of the failure is chosen from the failure that actually
   * happened (STOURIFY-248, following STOURIFY-225).
   */
  const failure = describeRequestFailure(error, 'the reviews')

  const empty = isLoading ? (
    <View style={{ gap: theme.spacing[3] }}>
      <Skeleton height={120} />
      <Skeleton height={120} />
      <Skeleton height={120} />
    </View>
  ) : isError ? (
    <EmptyState
      icon={failure.icon}
      title={failure.title}
      subtitle={failure.subtitle}
      actionLabel="Try again"
      onAction={() => void refetch()}
    />
  ) : (
    <EmptyState icon="⭐" title="No reviews yet" subtitle="Be the first to write one." />
  )

  /** The canvas's `.rev-sum` — its bars left out; see the doc named above. */
  const summary =
    rating !== null ? (
      <View
        testID="reviews-summary"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[4],
          padding: theme.spacing[4],
          borderRadius: 16,
          borderWidth: 1,
          borderColor: theme.colors.hairline,
          backgroundColor: theme.colors.card,
        }}
      >
        <Text style={{ fontFamily: theme.fontFamily.displayBold, fontSize: 40, lineHeight: 46 }}>
          {rating.toFixed(1)}
        </Text>
        <View style={{ gap: 2 }}>
          <Stars value={rating} label={`Rated ${rating.toFixed(1)} out of 5`} size={15} />
          <Text variant="caption" color="muted">
            {reviewsCount === 1 ? '1 review' : `${reviewsCount} reviews`}
          </Text>
        </View>
      </View>
    ) : null

  const now = Date.now()

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.surface }}
      edges={['top', 'bottom']}
    >
      <BarHeader
        testID="reviews-header"
        title="Reviews"
        subtitle={spot?.title}
        onBack={() => navigation.goBack()}
      />

      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{
          paddingHorizontal: theme.gutter,
          paddingTop: theme.spacing[1],
          paddingBottom: theme.spacing[3],
          gap: theme.spacing[3],
        }}
        ListHeaderComponent={summary}
        ListEmptyComponent={empty}
        renderItem={({ item }) => {
          const when = formatRelativeTime(item.createdAt, now)
          const meta = item.authorUsername ? `@${item.authorUsername} · ${when}` : when
          const pending = helpful.pendingUuid === item.id

          return (
            <View
              testID={`review-card-${item.id}`}
              style={{
                padding: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.hairline,
                backgroundColor: theme.colors.card,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar uri={item.authorAvatarUrl} name={item.authorName} size={40} />
                <View style={{ flex: 1 }}>
                  <Text
                    variant="body"
                    numberOfLines={1}
                    style={{ fontFamily: theme.fontFamily.bodySemiBold }}
                  >
                    {item.authorName}
                  </Text>
                  <Text variant="caption" color="muted" numberOfLines={1}>
                    {meta}
                  </Text>
                </View>
                <Stars value={item.rating} label={`Rated ${item.rating} out of 5`} size={13} />
              </View>

              {item.body ? (
                <Text variant="body" style={{ marginTop: 9 }}>
                  {item.body}
                </Text>
              ) : null}

              {item.isQueued ? (
                <View style={{ flexDirection: 'row', marginTop: 10 }}>
                  <Tag label="Queued ↑" />
                </View>
              ) : item.onServer ? (
                <View style={{ flexDirection: 'row', marginTop: 6 }}>
                  <Pressable
                    testID={`review-helpful-${item.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Helpful, ${item.helpfulCount}`}
                    accessibilityState={{ selected: item.markedHelpful, busy: pending }}
                    disabled={pending}
                    onPress={() =>
                      helpful.toggle({ uuid: item.id, marked_helpful: item.markedHelpful })
                    }
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      minHeight: theme.minTouchTarget,
                      opacity: pending ? 0.6 : 1,
                    }}
                  >
                    <Icon
                      name="thumbsUp"
                      size={15}
                      color={item.markedHelpful ? 'primary' : 'muted'}
                    />
                    <Text
                      variant="caption"
                      color={item.markedHelpful ? 'primary' : 'muted'}
                      style={{ fontFamily: theme.fontFamily.bodySemiBold }}
                    >
                      {`Helpful · ${item.helpfulCount}`}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {helpful.failedUuid === item.id ? (
                <Text testID={`review-helpful-error-${item.id}`} variant="caption" color="danger">
                  Couldn&apos;t reach the server
                </Text>
              ) : null}
            </View>
          )
        }}
      />

      {/*
        The way to add your own (STOURIFY-211), pinned as a sibling of the list
        so it is on screen in all three states: loading, empty, and a list too
        long to fit. `edges` includes `'bottom'` because this is the one thing
        on the screen the gesture bar could sit on top of.
      */}
      <View style={{ paddingHorizontal: theme.gutter, paddingTop: theme.spacing[3] }}>
        <Button
          label="Write a review"
          fullWidth
          onPress={() => navigation.navigate('WriteReview', { spotId })}
        />
      </View>
    </SafeAreaView>
  )
}

/**
 * A row of five stars: the filled ones in the handoff's star colour
 * (`accent2`), the rest in `muted` so an empty star still shows on a dark card.
 * One element with one label, so a screen reader says "Rated 4 out of 5"
 * instead of reading five star characters.
 */
function Stars({ value, label, size }: { value: number; label: string; size: number }) {
  const theme = useTheme()
  const filled = Math.max(0, Math.min(5, Math.round(value)))

  return (
    <Text
      accessibilityLabel={label}
      style={{
        fontSize: size,
        lineHeight: size + 5,
        letterSpacing: 1,
        color: theme.colors.accent2,
      }}
    >
      {'★'.repeat(filled)}
      <Text style={{ fontSize: size, color: theme.colors.muted }}>{'★'.repeat(5 - filled)}</Text>
    </Text>
  )
}
