import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native'
import type { Post } from '@/shared/api/types'

const { width } = Dimensions.get('window')

interface Props {
  post: Post
  onPress: () => void
  onLikePress?: () => void
}

function PostCard({ post, onPress, onLikePress }: Props) {
  const firstMedia = post.media?.[0]
  const userInitials = post.user?.name
    ? post.user.name.split(' ').map(n => n[0] ?? '').join('').toUpperCase() || '?'
    : '?'

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.initials}>{userInitials}</Text>
        </View>
        <View>
          <Text style={styles.userName}>{post.user?.name ?? 'Unknown'}</Text>
          <Text style={styles.time}>
            {post.created_at ? new Date(post.created_at).toLocaleDateString() : ''}
          </Text>
        </View>
      </View>

      {firstMedia && (
        <Image
          source={{ uri: firstMedia.url }}
          style={styles.media}
          resizeMode="cover"
        />
      )}

      {post.spot && (
        <View style={styles.spotChip}>
          <Text style={styles.spotChipText}>📍 {post.spot.name}</Text>
        </View>
      )}

      {post.caption ? (
        <Text style={styles.caption} numberOfLines={2}>{post.caption}</Text>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={onLikePress}>
          <Text style={styles.actionIcon}>❤️</Text>
          <Text style={styles.actionCount}>{post.likes_count}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} onPress={onPress}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionCount}>{post.comments_count}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )
}

export default React.memo(PostCard)

const styles = StyleSheet.create({
  card: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, marginHorizontal: 16, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#00b4d8', alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontWeight: '700', fontSize: 14 },
  userName: { color: '#fff', fontWeight: '600', fontSize: 14 },
  time: { color: '#aaa', fontSize: 12 },
  media: { width: '100%', height: width * 0.6 },
  spotChip: { margin: 12, marginBottom: 4, alignSelf: 'flex-start', backgroundColor: 'rgba(0,180,216,0.2)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  spotChipText: { color: '#00b4d8', fontSize: 12 },
  caption: { color: '#eee', fontSize: 14, paddingHorizontal: 12, paddingBottom: 8 },
  actions: { flexDirection: 'row', gap: 16, padding: 12, paddingTop: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionIcon: { fontSize: 16 },
  actionCount: { color: '#aaa', fontSize: 14 },
})
