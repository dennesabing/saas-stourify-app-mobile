import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { HomeStackParamList } from '@/shared/navigation/types'
import { getPost, setPostLike } from '@/shared/api/posts'
import PostActionsSheet from '@/features/social/components/PostActionsSheet'
import { Avatar, Button, HashtagText, Skeleton, Tag, Text } from '@/shared/components/ui'
import type { Post } from '@/shared/api/types'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<HomeStackParamList, 'PostDetail'>

const POST_QUERY_KEY = (postId: string) => ['post', postId] as const

/**
 * Post detail. Comments live on their own screen (`CommentsScreen`) — this
 * shows a count and a "View all N comments" affordance rather than the list
 * itself.
 */
export default function PostDetailScreen({ route, navigation }: Props) {
  const { postId } = route.params
  const theme = useTheme()
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)

  const { data: post, isLoading } = useQuery({
    queryKey: POST_QUERY_KEY(postId),
    queryFn: () => getPost(postId),
  })

  /**
   * The same shape as the feed's like, and deliberately so — see `FeedScreen`
   * and `setPostLike`. The mutation is told the state to end up in rather than
   * asked to flip, because the server reads a repeated like as "take it back",
   * and `onSuccess` replaces the optimistic count with the server's own.
   */
  const likeMutation = useMutation({
    mutationFn: (liked: boolean) => setPostLike(postId, liked),
    onMutate: async (liked: boolean) => {
      await queryClient.cancelQueries({ queryKey: POST_QUERY_KEY(postId) })
      const previous = queryClient.getQueryData<Post>(POST_QUERY_KEY(postId))

      queryClient.setQueryData<Post>(POST_QUERY_KEY(postId), (old) =>
        old
          ? {
              ...old,
              is_liked: liked,
              likes_count: Math.max(0, old.likes_count + (liked ? 1 : -1)),
            }
          : old,
      )

      return { previous }
    },
    onSuccess: (state) => {
      queryClient.setQueryData<Post>(POST_QUERY_KEY(postId), (old) =>
        old ? { ...old, is_liked: state.liked, likes_count: state.likes_count } : old,
      )
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData<Post>(POST_QUERY_KEY(postId), context.previous)
      }
    },
  })

  const author = post?.author
  const liked = post?.is_liked === true

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{
            flex: 1,
            minHeight: theme.minTouchTarget,
            justifyContent: 'center',
            paddingHorizontal: theme.gutter,
          }}
        >
          <Text variant="body" color="primary">
            ← Back
          </Text>
        </Pressable>

        {/* Reporting is reachable from here as well as from the feed row: the
            reader who opened a post to look closer is the one most likely to
            decide it needs reporting (STOURIFY-37). */}
        <Pressable
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="More options for this post"
          style={{
            minWidth: theme.minTouchTarget,
            minHeight: theme.minTouchTarget,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: theme.spacing[2],
          }}
        >
          <Text variant="h2" color="muted">
            ⋯
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.gutter, gap: theme.spacing[3] }}>
        {isLoading || !post ? (
          <View style={{ gap: theme.spacing[3] }}>
            <Skeleton height={20} width="60%" />
            <Skeleton height={120} />
          </View>
        ) : (
          <>
            {/* The author is a tap-target here as well as in the feed row: a
                reader who has already opened a post should not have to go back
                out to reach the person behind it (STOURIFY-35). Inert when the
                `user` relation was never loaded — there is no uuid to open. */}
            <Pressable
              onPress={
                author ? () => navigation.navigate('Profile', { userId: author.uuid }) : undefined
              }
              disabled={!author}
              accessibilityRole={author ? 'button' : undefined}
              accessibilityLabel={author ? `${author.name}'s profile` : undefined}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing[3],
                minHeight: theme.minTouchTarget,
              }}
            >
              <Avatar uri={author?.avatar_url} name={author?.name} size={40} />
              <View style={{ flex: 1 }}>
                <Text variant="h2" numberOfLines={1}>
                  {author?.name ?? 'Unknown'}
                </Text>
                {author?.username ? (
                  <Text variant="caption" color="muted">
                    @{author.username}
                  </Text>
                ) : null}
              </View>
            </Pressable>

            {post.spot ? (
              <Pressable
                onPress={() => navigation.navigate('SpotDetail', { spotId: post.spot!.uuid })}
                accessibilityRole="button"
                accessibilityLabel={`View ${post.spot.title}`}
                style={{
                  minHeight: theme.minTouchTarget,
                  justifyContent: 'center',
                  alignSelf: 'flex-start',
                }}
              >
                <Tag label={`📍 ${post.spot.title}`} />
              </Pressable>
            ) : null}

            {post.caption ? (
              <HashtagText
                variant="body"
                text={post.caption}
                onPressHashtag={(slug) => navigation.navigate('Tag', { slug })}
              />
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[6] }}>
              <Pressable
                onPress={() => likeMutation.mutate(!liked)}
                accessibilityRole="button"
                accessibilityLabel="Like"
                accessibilityState={{ selected: liked }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing[1],
                  minHeight: theme.minTouchTarget,
                  minWidth: theme.minTouchTarget,
                  justifyContent: 'center',
                }}
              >
                <Text variant="body" color={liked ? 'danger' : 'muted'}>
                  {liked ? '♥' : '♡'}
                </Text>
                <Text variant="body" color="muted">
                  {post.likes_count}
                </Text>
              </Pressable>
            </View>

            <Button
              label={`View all ${post.comments_count} comments`}
              variant="secondary"
              onPress={() => navigation.navigate('Comments', { postId: post.uuid })}
            />
          </>
        )}
      </ScrollView>

      <PostActionsSheet postUuid={menuOpen ? postId : null} onClose={() => setMenuOpen(false)} />
    </SafeAreaView>
  )
}
