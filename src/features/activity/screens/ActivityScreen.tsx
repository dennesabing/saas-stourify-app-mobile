import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FlatList, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ActivityStackParamList } from '@/shared/navigation/types'
import { acceptFollowRequest, declineFollowRequest, getFollowRequests } from '@/shared/api/follows'
import { Avatar, Button, Card, EmptyState, Skeleton, Text } from '@/shared/components/ui'
import type { Follow, PaginatedResponse } from '@/shared/api/types'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<ActivityStackParamList, 'Activity'>

const FOLLOW_REQUESTS_QUERY_KEY = ['follow-requests'] as const

/**
 * Activity as the follow-request inbox.
 *
 * There is no notifications/activity API anywhere in the module or the
 * boilerplate — no endpoint, no table. `GET /api/v1/follows/requests` is what
 * genuinely exists and is actionable, so this screen ships as that inbox
 * rather than a fake feed. See the M3b plan's scope decisions.
 */
export default function ActivityScreen({ navigation }: Props) {
  const theme = useTheme()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: FOLLOW_REQUESTS_QUERY_KEY,
    queryFn: getFollowRequests,
  })

  const requests = data?.data ?? []

  const removeRow = useCallback(
    (followUuid: string) => {
      queryClient.setQueryData<PaginatedResponse<Follow>>(FOLLOW_REQUESTS_QUERY_KEY, (old) =>
        old ? { ...old, data: old.data.filter((f) => f.uuid !== followUuid) } : old,
      )
    },
    [queryClient],
  )

  const acceptMutation = useMutation({
    mutationFn: (followUuid: string) => acceptFollowRequest(followUuid),
    onSuccess: (_data, followUuid) => removeRow(followUuid),
  })

  const declineMutation = useMutation({
    mutationFn: (followUuid: string) => declineFollowRequest(followUuid),
    onSuccess: (_data, followUuid) => removeRow(followUuid),
  })

  const renderItem = useCallback(
    ({ item }: { item: Follow }) => (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}>
          <Avatar name={item.follower?.name} uri={item.follower?.avatar} />
          <View style={{ flex: 1 }}>
            <Text
              variant="body"
              onPress={
                item.follower?.uuid
                  ? () => navigation.navigate('Profile', { userId: item.follower!.uuid })
                  : undefined
              }
            >
              {item.follower?.name ?? 'Someone'}
            </Text>
            <Text variant="caption" color="muted">
              wants to follow you
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
            <Button
              label="Decline"
              variant="secondary"
              size="md"
              onPress={() => declineMutation.mutate(item.uuid)}
              disabled={acceptMutation.isPending || declineMutation.isPending}
            />
            <Button
              label="Accept"
              variant="primary"
              size="md"
              onPress={() => acceptMutation.mutate(item.uuid)}
              disabled={acceptMutation.isPending || declineMutation.isPending}
            />
          </View>
        </View>
      </Card>
    ),
    [acceptMutation, declineMutation, navigation, theme],
  )

  /**
   * Only reached with no rows to show, and the three cases are genuinely
   * different situations with different remedies — so they get different
   * words: "we are still asking", "we could not ask", and "we asked and there
   * is nothing".
   *
   * Before STOURIFY-86 there were two branches, and a failed request fell into
   * the empty one: a reader whose request had just timed out was told nobody
   * wants to follow them, which is a claim about their account rather than
   * about the network. The 15-second timeout in `shared/api/client.ts` makes
   * that routine.
   *
   * Two orderings here are load-bearing, and they are the same two `FeedScreen`
   * documents at length — read `FeedScreen.tsx:106-132` before changing this.
   *
   * **This lives inside `ListEmptyComponent`**, which only renders when the
   * list has no rows at all, so content always wins over an error. React Query
   * keeps serving requests it already holds while a later fetch fails; hoisting
   * an `isError` check above the `FlatList` would delete that protection and
   * never once show it had, because the branch is unreachable while online.
   *
   * **`isLoading` is asked before `isError`.** `isLoading` is true only for a
   * first fetch with nothing cached, so a slow first load shows skeletons
   * rather than a failure. `isError` then stays true through a retry until one
   * succeeds, which holds the failure message up while the retry is in flight
   * instead of flickering to the empty message and back.
   */
  const empty = isLoading ? (
    <View style={{ padding: theme.gutter, gap: theme.spacing[4] }}>
      <Skeleton height={72} />
      <Skeleton height={72} />
    </View>
  ) : isError ? (
    <EmptyState
      icon="📡"
      title="Couldn't load your requests"
      subtitle="We couldn't reach Stourify just now. Check your connection and try again."
      actionLabel="Try again"
      onAction={() => void refetch()}
    />
  ) : (
    <EmptyState
      icon="🔔"
      title="Nothing yet"
      subtitle="Follows, likes, comments and badge unlocks will land here."
    />
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.uuid}
        renderItem={renderItem}
        contentContainerStyle={
          requests.length === 0 ? { flex: 1 } : { padding: theme.gutter, gap: theme.spacing[3] }
        }
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing[3] }} />}
        ListEmptyComponent={empty}
      />
    </SafeAreaView>
  )
}
