import { useCallback, useState } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { FlatList, RefreshControl, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { HomeStackParamList } from '@/shared/navigation/types'
import PostActionsSheet from '@/features/social/components/PostActionsSheet'
import { EmptyState, PostCard, Skeleton } from '@/shared/components/ui'
import { getFollowingFeed } from '@/shared/api/feed'
import { toggleLike } from '@/shared/api/posts'
import type { CursorPaginatedResponse, Post } from '@/shared/api/types'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<HomeStackParamList, 'Home'>

const FEED_QUERY_KEY = ['feed', 'following'] as const

type FeedData = InfiniteData<CursorPaginatedResponse<Post>, string | undefined>

/** Flip `is_liked`/`likes_count` for one post across every loaded page. */
function flipLike(data: FeedData | undefined, postUuid: string): FeedData | undefined {
  if (!data) return data

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      data: page.data.map((post) =>
        post.uuid === postUuid
          ? {
              ...post,
              is_liked: !post.is_liked,
              likes_count: post.likes_count + (post.is_liked ? -1 : 1),
            }
          : post,
      ),
    })),
  }
}

export default function FeedScreen({ navigation }: Props) {
  const theme = useTheme()
  const queryClient = useQueryClient()

  // The uuid of the post whose overflow is open, or null. One sheet for the
  // whole list rather than one per row: a FlatList of a hundred rows would
  // otherwise mount a hundred modals (STOURIFY-37).
  const [reportingPost, setReportingPost] = useState<string | null>(null)

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: FEED_QUERY_KEY,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => getFollowingFeed(pageParam),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  })

  const posts = data?.pages.flatMap((p) => p.data) ?? []

  // Optimistic: the cache flips immediately so the tap feels instant — this is
  // the screen the persisted cache exists for. A network-bound like defeats it.
  const likeMutation = useMutation({
    mutationFn: (postUuid: string) => toggleLike(postUuid),
    onMutate: async (postUuid: string) => {
      await queryClient.cancelQueries({ queryKey: FEED_QUERY_KEY })
      const previous = queryClient.getQueryData<FeedData>(FEED_QUERY_KEY)
      queryClient.setQueryData<FeedData>(FEED_QUERY_KEY, (old) => flipLike(old, postUuid))
      return { previous }
    },
    onError: (_err, _postUuid, context) => {
      if (context?.previous) {
        queryClient.setQueryData<FeedData>(FEED_QUERY_KEY, context.previous)
      }
    },
  })

  const renderItem = useCallback(
    ({ item }: { item: Post }) => (
      <PostCard
        post={item}
        onPress={() => navigation.navigate('PostDetail', { postId: item.uuid })}
        onLikePress={() => likeMutation.mutate(item.uuid)}
        onAuthorPress={
          item.author
            ? () => navigation.navigate('Profile', { userId: item.author!.uuid })
            : undefined
        }
        onMorePress={() => setReportingPost(item.uuid)}
      />
    ),
    [navigation, likeMutation],
  )

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  /**
   * Only reached with no rows to show, and the three cases are genuinely
   * different situations with different remedies — so they get different
   * words: "we are still asking", "we could not ask", and "we asked and there
   * is nothing".
   *
   * Before STOURIFY-41 there were two branches, and a failed request fell into
   * the empty one. A reader told their feed is empty concludes the app has
   * nothing for them and stops; a reader told the request failed tries again.
   * The 15-second timeout in `shared/api/client.ts` makes that a routine
   * occurrence rather than an exotic one.
   *
   * Two orderings here are load-bearing:
   *
   * **This lives inside `ListEmptyComponent`**, which only renders when the
   * list has no rows at all — so content always wins over an error. Launch
   * offline with a warm persisted cache and yesterday's posts render with no
   * error shown. Hoisting an `isError` check above the `FlatList` would delete
   * that, and never once show it had, because the branch is unreachable while
   * online. `DiscoverScreen` carries the same warning.
   *
   * **`isLoading` is asked before `isError`.** `isLoading` is true only for a
   * first fetch with nothing cached, so a slow first load must show skeletons
   * rather than a failure. `isError` then stays true through a retry until one
   * succeeds, which keeps the failure message up while the retry is in flight
   * instead of flickering to the empty message and back.
   */
  const empty = isLoading ? (
    <View style={{ padding: theme.gutter, gap: theme.spacing[4] }}>
      <Skeleton height={140} />
      <Skeleton height={140} />
      <Skeleton height={140} />
    </View>
  ) : isError ? (
    <EmptyState
      icon="📡"
      title="Couldn't load your feed"
      subtitle="We couldn't reach Stourify just now. Your feed is still there — check your connection and try again."
      actionLabel="Try again"
      onAction={() => void refetch()}
    />
  ) : (
    <EmptyState icon="👣" title="Your feed is empty" subtitle="Follow people to see their posts" />
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <FlatList
        testID="feed-list"
        data={posts}
        keyExtractor={(item) => item.uuid}
        renderItem={renderItem}
        contentContainerStyle={
          posts.length === 0
            ? { flex: 1 }
            : { paddingHorizontal: theme.gutter, paddingVertical: theme.spacing[4] }
        }
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing[4] }} />}
        ListEmptyComponent={empty}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={{ paddingHorizontal: theme.gutter, paddingTop: theme.spacing[4] }}>
              <Skeleton height={140} />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.colors.primary} />
        }
      />

      <PostActionsSheet postUuid={reportingPost} onClose={() => setReportingPost(null)} />
    </SafeAreaView>
  )
}
