import { useCallback, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import { getUser } from '@/shared/api/users'
import { getPosts, getUserPosts } from '@/shared/api/posts'
import { follow, unfollow } from '@/shared/api/follows'
import { useAuthStore } from '@/shared/store/auth'
import type { Post } from '@/shared/api/types'

type Props = NativeStackScreenProps<ProfileStackParamList, 'Profile'>

const W3 = 120

export default function ProfileScreen({ route, navigation }: Props) {
  const userId = route.params?.userId
  const { user: currentUser } = useAuthStore()
  const isOwn = !userId || userId === currentUser?.uuid
  const targetId = isOwn ? (currentUser?.uuid ?? '') : userId
  const qc = useQueryClient()

  const { data: user } = useQuery({
    queryKey: ['user', targetId],
    queryFn: () => getUser(targetId),
    enabled: !!targetId,
  })

  const { data: postsData } = useQuery({
    queryKey: ['user-posts', targetId],
    queryFn: () => isOwn ? getPosts() : getUserPosts(targetId),
    enabled: !!targetId,
  })

  const [isFollowing, setIsFollowing] = useState(false)

  const followMutation = useMutation({
    mutationFn: () => follow(targetId),
    onSuccess: () => {
      setIsFollowing(true)
      qc.invalidateQueries({ queryKey: ['user', targetId] })
      qc.invalidateQueries({ queryKey: ['follow-list'] })
    },
  })

  const unfollowMutation = useMutation({
    mutationFn: () => unfollow(targetId),
    onSuccess: () => {
      setIsFollowing(false)
      qc.invalidateQueries({ queryKey: ['user', targetId] })
      qc.invalidateQueries({ queryKey: ['follow-list'] })
    },
  })

  const posts = postsData?.data ?? []
  const displayUser = isOwn ? currentUser : user
  const initials = displayUser?.name
    ? displayUser.name.split(' ').map((n) => n[0] ?? '').join('').toUpperCase() || '?'
    : '?'

  const renderThumb = useCallback(
    ({ item }: { item: Post }) => (
      <TouchableOpacity
        style={styles.thumb}
        onPress={() => navigation.navigate('PostDetail', { postId: item.uuid })}
      >
        {item.media?.[0] && (
          <Image source={{ uri: item.media[0].url }} style={styles.thumbImg} />
        )}
      </TouchableOpacity>
    ),
    [navigation],
  )

  return (
    <FlatList
      style={styles.container}
      ListHeaderComponent={
        <View>
          <View style={styles.cover} />
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.initials}>{initials}</Text>
            </View>
          </View>
          <View style={styles.info}>
            <Text style={styles.name}>{displayUser?.name ?? '...'}</Text>
            <Text style={styles.bio}>{displayUser?.bio ?? ''}</Text>
          </View>
          <View style={styles.stats}>
            {[
              { label: 'Posts', value: posts.length, onPress: undefined },
              { label: 'Followers', value: '–', onPress: () => navigation.navigate('FollowList', { userId: targetId, type: 'followers' }) },
              { label: 'Following', value: '–', onPress: () => navigation.navigate('FollowList', { userId: targetId, type: 'following' }) },
            ].map((s) => (
              <TouchableOpacity key={s.label} style={styles.stat} onPress={s.onPress}>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {isOwn ? (
            <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('EditProfile')}>
              <Text style={styles.editBtnText}>Edit Profile</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.followBtn, isFollowing && styles.followingBtn]}
              onPress={() => isFollowing ? unfollowMutation.mutate() : followMutation.mutate()}
              disabled={followMutation.isPending || unfollowMutation.isPending}
            >
              <Text style={styles.followBtnText}>{isFollowing ? 'Following' : 'Follow'}</Text>
            </TouchableOpacity>
          )}
        </View>
      }
      data={posts}
      numColumns={3}
      keyExtractor={(p) => p.uuid}
      renderItem={renderThumb}
      columnWrapperStyle={{ gap: 2 }}
    />
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  cover: { height: 140, backgroundColor: '#1a3a50' },
  avatarWrap: { alignItems: 'center', marginTop: -40 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#00b4d8', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#0f1923' },
  initials: { color: '#fff', fontWeight: '700', fontSize: 28 },
  info: { alignItems: 'center', padding: 12 },
  name: { color: '#fff', fontWeight: '700', fontSize: 20 },
  bio: { color: '#aaa', fontSize: 14, textAlign: 'center', marginTop: 4 },
  stats: { flexDirection: 'row', justifyContent: 'space-evenly', paddingVertical: 16 },
  stat: { alignItems: 'center' },
  statValue: { color: '#fff', fontWeight: '700', fontSize: 18 },
  statLabel: { color: '#aaa', fontSize: 12 },
  editBtn: { marginHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: '#00b4d8', borderRadius: 10, padding: 12, alignItems: 'center' },
  editBtnText: { color: '#00b4d8', fontWeight: '600' },
  followBtn: { marginHorizontal: 16, marginBottom: 16, backgroundColor: '#00b4d8', borderRadius: 10, padding: 12, alignItems: 'center' },
  followingBtn: { backgroundColor: 'rgba(0,180,216,0.2)', borderWidth: 1, borderColor: '#00b4d8' },
  followBtnText: { color: '#fff', fontWeight: '700' },
  thumb: { width: W3, height: W3, backgroundColor: '#1a2a3a', margin: 1 },
  thumbImg: { width: W3, height: W3 },
})
