import React from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import type { Post } from '@/shared/api/types'
import Avatar from './Avatar'
import Card from './Card'
import Tag from './Tag'
import Text from './Text'

interface Props {
  post: Post
  onPress: () => void
  onLikePress?: () => void
}

/**
 * A feed row. Renders from `PostResource`'s nested `author` — which is
 * `whenLoaded('user')` server-side and so is genuinely absent on some paths.
 * Never crash on that; fall back to "Unknown" and an initial-less avatar.
 *
 * Renders the post's first photo when it has one. This card used to carry the
 * opposite claim — *"`PostResource` has no media key"* — and rendered text only.
 * The resource does return `media`, an array of `{uuid, url, thumb_url}`, which
 * is why `Post.media` has been typed all along; the docblock was simply wrong,
 * and it made STOURIFY-18's photos upload correctly and then appear nowhere.
 *
 * First photo only: a feed row is a summary, and the post detail screen is
 * where the rest belong. `thumb_url` is preferred when present, but the platform
 * only generates a `thumb` conversion for avatars, so `url` is the normal case.
 */
function PostCard({ post, onPress, onLikePress }: Props) {
  const theme = useTheme()
  const author = post.author
  const liked = post.is_liked === true
  const photo = post.media?.[0]

  return (
    <Card
      onPress={onPress}
      padded={false}
      accessibilityLabel={`Post by ${author?.name ?? 'Unknown'}`}
      style={styles.card}
    >
      <View style={[styles.header, { padding: theme.spacing[3], gap: theme.spacing[3] }]}>
        <Avatar uri={author?.avatar_url} name={author?.name} size={36} />
        <View style={styles.identity}>
          <Text variant="h2" numberOfLines={1}>
            {author?.name ?? 'Unknown'}
          </Text>
          {author?.username ? (
            <Text variant="caption" color="muted" numberOfLines={1}>
              @{author.username}
            </Text>
          ) : null}
        </View>
      </View>

      {photo ? (
        <Image
          source={{ uri: photo.thumb_url ?? photo.url }}
          style={styles.photo}
          resizeMode="cover"
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Photo in post by ${author?.name ?? 'Unknown'}`}
        />
      ) : null}

      {post.spot ? (
        <View style={{ paddingHorizontal: theme.spacing[3], paddingBottom: theme.spacing[2] }}>
          <Tag label={post.spot.name} />
        </View>
      ) : null}

      {post.caption ? (
        <Text
          variant="body"
          numberOfLines={2}
          style={{ paddingHorizontal: theme.spacing[3], paddingBottom: theme.spacing[3] }}
        >
          {post.caption}
        </Text>
      ) : null}

      <View style={[styles.actions, { padding: theme.spacing[3], gap: theme.spacing[6] }]}>
        <Pressable
          onPress={onLikePress}
          accessibilityRole="button"
          accessibilityLabel="Like"
          accessibilityState={{ selected: liked }}
          style={[styles.action, { minHeight: theme.minTouchTarget, minWidth: theme.minTouchTarget }]}
        >
          <Text variant="body" color={liked ? 'danger' : 'muted'} style={styles.actionIcon}>
            {liked ? '♥' : '♡'}
          </Text>
          <Text variant="body" color="muted">
            {post.likes_count}
          </Text>
        </Pressable>

        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Comments"
          style={[styles.action, { minHeight: theme.minTouchTarget, minWidth: theme.minTouchTarget }]}
        >
          <Text variant="body" style={styles.actionIcon}>
            💬
          </Text>
          <Text variant="body" color="muted">
            {post.comments_count}
          </Text>
        </Pressable>
      </View>
    </Card>
  )
}

export default React.memo(PostCard)

const styles = StyleSheet.create({
  card: { marginBottom: 0 },
  photo: { width: '100%', aspectRatio: 1 },
  header: { flexDirection: 'row', alignItems: 'center' },
  identity: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  actionIcon: { fontSize: 16 },
})
