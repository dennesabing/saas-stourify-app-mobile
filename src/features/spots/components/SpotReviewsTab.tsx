import { View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { describeRequestFailure } from '@/shared/api/errorMessage'
import { getSpotReviews } from '@/shared/api/reviews'
import { Avatar, Button, Card, EmptyState, Skeleton, Text } from '@/shared/components/ui'
import { formatRelativeTime } from '@/shared/utils/relativeTime'
import { useTheme } from '@/theme/ThemeProvider'

interface Props {
  spotUuid: string
  /**
   * The spot's own count, from the spot request. Undefined when that request
   * has not answered, and the button then says "Read all reviews" rather than
   * guessing a number.
   */
  reviewsCount?: number
  /**
   * Open the full reviews list. A callback for the reason `SpotAboutTab` gives:
   * nothing in this app looks navigation up, and the jest harness mounts
   * components with no navigator to find.
   */
  onOpenReviews: () => void
}

/**
 * The Reviews tab on a spot's page: the newest review, and a door to the rest
 * (artboard 1 of the Spot Hub design, STOURIFY-292).
 *
 * A shop window, not the shop. The full list, and the button to write one, live
 * on `ReviewsScreen` (STOURIFY-211), and this tab does not grow a second copy of
 * either.
 *
 * It asks with `ReviewsScreen`'s own cache key, `['spot-reviews', uuid]`, and
 * the same request, so the two screens share one answer: a review read on
 * either is on the other the moment it opens. The server sends them newest
 * first, so the newest is simply the first row.
 *
 * It is mounted only while its tab is showing, so a spot page opened on About
 * does not fetch reviews nobody asked to see.
 */
export default function SpotReviewsTab({ spotUuid, reviewsCount, onOpenReviews }: Props) {
  const theme = useTheme()

  const { data, error, isLoading, isError, refetch } = useQuery({
    queryKey: ['spot-reviews', spotUuid],
    queryFn: () => getSpotReviews(spotUuid),
  })

  const newest = data?.data?.[0]
  const failure = describeRequestFailure(error, 'the reviews')

  const readAllLabel =
    reviewsCount === undefined
      ? 'Read all reviews'
      : reviewsCount === 1
        ? 'Read the review'
        : `Read all ${reviewsCount} reviews`

  /*
   * The same three "no review on screen" states as every list here, asked in
   * the same order and for the same reason (STOURIFY-85): still asking, could
   * not ask, and asked and there is nothing are three different claims. The
   * error branch is gated on there being nothing to show, so a review read
   * yesterday stays readable offline.
   */
  if (isLoading) {
    return (
      <View testID="spot-reviews-loading">
        <Skeleton height={120} />
      </View>
    )
  }

  if (!newest && isError) {
    return (
      <EmptyState
        icon={failure.icon}
        title={failure.title}
        subtitle={failure.subtitle}
        actionLabel="Try again"
        onAction={() => void refetch()}
      />
    )
  }

  if (!newest) {
    return (
      <EmptyState
        icon="⭐"
        title="No reviews yet"
        subtitle="Be the first to write one."
        actionLabel="Open reviews"
        onAction={onOpenReviews}
      />
    )
  }

  const stars = Math.max(0, Math.min(5, Math.round(newest.rating)))

  return (
    <View style={{ gap: theme.spacing[3] }}>
      <Card raised={false} testID="spot-review-newest">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar uri={newest.author?.avatar_url} name={newest.author?.name} size={36} />
          <View style={{ flex: 1 }}>
            <Text
              variant="body"
              numberOfLines={1}
              style={{ fontFamily: theme.fontFamily.bodySemiBold }}
            >
              {newest.author?.name ?? 'Explorer'}
            </Text>
            <Text
              variant="caption"
              numberOfLines={1}
              accessibilityLabel={`Rated ${newest.rating} out of 5`}
            >
              <Text variant="caption" style={{ color: theme.colors.accent2 }}>
                {'★'.repeat(stars)}
              </Text>
              <Text variant="caption" color="muted">
                {' · '}
              </Text>
              <Text variant="caption" color="muted">
                {formatRelativeTime(Date.parse(newest.created_at), Date.now())}
              </Text>
            </Text>
          </View>
        </View>

        {newest.body ? (
          <Text variant="body" style={{ marginTop: theme.spacing[2] }}>
            {newest.body}
          </Text>
        ) : null}
      </Card>

      <Button label={readAllLabel} variant="secondary" fullWidth onPress={onOpenReviews} />
    </View>
  )
}
