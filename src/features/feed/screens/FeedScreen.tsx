import { useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { FlatList, View, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { FeedStackParamList } from '@/shared/navigation/types'
import PostCard from '@/shared/components/PostCard'
import EmptyState from '@/shared/components/EmptyState'
import { getFollowingFeed } from '@/shared/api/feed'
import type { Post } from '@/shared/api/types'

type Props = NativeStackScreenProps<FeedStackParamList, 'Feed'>

export default function FeedScreen({ navigation }: Props) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch, isRefetching } =
    useInfiniteQuery({
      queryKey: ['feed', 'following'],
      queryFn: ({ pageParam }: { pageParam: string | undefined }) => getFollowingFeed(pageParam),
      getNextPageParam: (last) => last.next_cursor ?? undefined,
      initialPageParam: undefined as string | undefined,
    })

  const posts = data?.pages.flatMap((p) => p.data) ?? []

  const renderItem = useCallback(
    ({ item }: { item: Post }) => (
      <PostCard
        post={item}
        onPress={() => navigation.navigate('PostDetail', { postId: item.uuid })}
      />
    ),
    [navigation],
  )

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.uuid}
        renderItem={renderItem}
        contentContainerStyle={posts.length === 0 ? styles.empty : { paddingVertical: 16 }}
        ListEmptyComponent={isLoading
          ? () => <ActivityIndicator color="#00b4d8" size="large" style={{ marginTop: 40 }} />
          : () => (
              <EmptyState
                icon="👣"
                title="Your feed is empty"
                subtitle="Follow people to see their posts"
              />
            )
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color="#00b4d8" style={{ padding: 16 }} /> : null}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#00b4d8" />}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  empty: { flex: 1 },
})
