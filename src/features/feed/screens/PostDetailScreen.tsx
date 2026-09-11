import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { HomeStackParamList } from '@/shared/navigation/types'
import { getPost, setPostLike } from '@/shared/api/posts'
import PostActionsSheet from '@/features/social/components/PostActionsSheet'
import { Avatar, BarHeader, HashtagText, Icon, Skeleton, Text } from '@/shared/components/ui'
import type { Post } from '@/shared/api/types'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<HomeStackParamList, 'PostDetail'>

const POST_QUERY_KEY = (postId: string) => ['post', postId] as const

/** The design's detail photo: full-bleed, a fixed 300 tall (artboard 3). */
const PHOTO_HEIGHT = 300

/**
 * Post detail, laid out as the Home Feed design's Post Detail artboard
 * (STOURIFY-260): a round-back "Post" header, the photo edge to edge, the
 * author, the spot as a badge pill, the caption, the like and comment actions,
 * and the like count in words.
 *
 * Comments live on their own screen (`CommentsScreen`) — this shows a count and
 * a "View all N comments" row rather than the list itself.
 *
 * The artboard's Follow button, share arrow, bookmark and "tap to see who" are
 * not drawn: a post's author carries no follow state, there is no messaging or
 * public link to share, no saving, and no likers list. STOURIFY-260 names each.
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
  const photo = post?.media?.[0]
  const semiBold = { fontFamily: theme.fontFamily.bodySemiBold }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <BarHeader
        title="Post"
        onBack={() => navigation.goBack()}
        right={
          // Reporting is reachable from here as well as from the feed row: the
          // reader who opened a post to look closer is the one most likely to
          // decide it needs reporting (STOURIFY-37).
          <Pressable
            onPress={() => setMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="More options for this post"
            style={{
              minWidth: theme.minTouchTarget,
              minHeight: theme.minTouchTarget,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="more" size={20} />
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing[6] }}>
        {isLoading || !post ? (
          <View style={{ padding: theme.gutter, gap: theme.spacing[3] }}>
            <Skeleton height={PHOTO_HEIGHT} />
            <Skeleton height={20} width="60%" />
          </View>
        ) : (
          <>
            {photo ? (
              <Image
                source={{ uri: photo.url }}
                style={{
                  width: '100%',
                  height: PHOTO_HEIGHT,
                  backgroundColor: theme.colors.surfaceAlt,
                }}
                contentFit="cover"
                transition={theme.motion.fast}
                accessibilityLabel={`Photo in post by ${author?.name ?? 'Unknown'}`}
              />
            ) : null}

            <View style={{ paddingHorizontal: theme.gutter, paddingTop: 14, gap: 10 }}>
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
                  gap: 9,
                  minHeight: theme.minTouchTarget,
                }}
              >
                <Avatar uri={author?.avatar_url} name={author?.name} size={30} />
                {/* `flex: 1` so the name fills the row — see `PostCard`'s `name`
                    style for the early ellipsis a shrink-wrapped name gets. */}
                <Text variant="caption" numberOfLines={1} style={[semiBold, { flex: 1 }]}>
                  {author?.name ?? 'Unknown'}
                </Text>
              </Pressable>

              {post.spot ? (
                <Pressable
                  onPress={() => navigation.navigate('SpotDetail', { spotId: post.spot!.uuid })}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${post.spot.title}`}
                  hitSlop={theme.spacing[1]}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    alignSelf: 'flex-start',
                    gap: 6,
                    paddingVertical: 7,
                    paddingHorizontal: theme.spacing[3],
                    borderRadius: 20,
                    backgroundColor: theme.colors.badgeBg,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Icon name="pin" size={13} color="badgeInk" />
                  <Text variant="caption" color="badgeInk" style={[semiBold, { fontSize: 12 }]}>
                    {post.spot.title} · View spot
                  </Text>
                </Pressable>
              ) : null}

              {post.caption ? (
                <HashtagText
                  variant="body"
                  text={post.caption}
                  onPressHashtag={(slug) => navigation.navigate('Tag', { slug })}
                  style={{ fontSize: 14, lineHeight: 22 }}
                />
              ) : null}

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                <Pressable
                  onPress={() => likeMutation.mutate(!liked)}
                  accessibilityRole="button"
                  accessibilityLabel="Like"
                  accessibilityState={{ selected: liked }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: theme.minTouchTarget,
                  }}
                >
                  <Icon
                    name="heart"
                    size={22}
                    color={liked ? 'danger' : 'ink'}
                    fill={liked ? 'danger' : undefined}
                  />
                  <Text variant="caption" color={liked ? 'danger' : 'ink'} style={semiBold}>
                    {post.likes_count}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => navigation.navigate('Comments', { postId: post.uuid })}
                  accessibilityRole="button"
                  accessibilityLabel="Comments"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: theme.minTouchTarget,
                  }}
                >
                  <Icon name="comment" size={22} />
                  <Text variant="caption" style={semiBold}>
                    {post.comments_count}
                  </Text>
                </Pressable>
              </View>

              {/* The design's "248 likes · tap to see who", without the half
                  that has nothing behind it: there is no likers list, so this
                  states the count and is not a button (STOURIFY-260). */}
              <Text variant="caption" style={semiBold}>
                {post.likes_count === 1 ? '1 like' : `${post.likes_count} likes`}
              </Text>

              <Pressable
                onPress={() => navigation.navigate('Comments', { postId: post.uuid })}
                accessibilityRole="button"
                style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}
              >
                <Text variant="caption" color="muted">
                  {`View all ${post.comments_count} comments`}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <PostActionsSheet postUuid={menuOpen ? postId : null} onClose={() => setMenuOpen(false)} />
    </SafeAreaView>
  )
}
