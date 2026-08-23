import { useMemo } from 'react'
import { FlatList, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { HomeStackParamList } from '@/shared/navigation/types'
import { getSpotReviews } from '@/shared/api/reviews'
import { Avatar, Card, Divider, EmptyState, Rating, Tag, Text } from '@/shared/components/ui'
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

  const { data: serverData } = useQuery({
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: theme.gutter,
          gap: theme.spacing[3],
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => navigation.goBack()}
          style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}
        >
          <Text variant="body" color="primary">
            ← Back
          </Text>
        </Pressable>
        <Text variant="h1">Reviews</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{ padding: theme.gutter, gap: theme.spacing[3] }}
        ListEmptyComponent={
          <EmptyState icon="⭐" title="No reviews yet" subtitle="Be the first to write one." />
        }
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
    </SafeAreaView>
  )
}
