import { useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import { getFollowers, getFollowing } from '@/shared/api/follows'
import type { Follow, User } from '@/shared/api/types'

type Props = NativeStackScreenProps<ProfileStackParamList, 'FollowList'>

export default function FollowListScreen({ route, navigation }: Props) {
  const { userId, type } = route.params

  const { data } = useQuery({
    queryKey: ['follow-list', type, userId],
    queryFn: () => type === 'followers' ? getFollowers(userId) : getFollowing(userId),
  })

  const users: User[] = (data?.data ?? [])
    .map((f: Follow) => (type === 'followers' ? f.follower : f.followee))
    .filter((u): u is User => !!u)

  const renderUser = useCallback(
    ({ item }: { item: User }) => {
      const initials = item.name
        ? item.name.split(' ').map((n) => n[0] ?? '').join('').toUpperCase() || '?'
        : '?'
      return (
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('Profile', { userId: item.uuid })}
        >
          <View style={styles.avatar}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
          </View>
        </TouchableOpacity>
      )
    },
    [navigation],
  )

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{type === 'followers' ? 'Followers' : 'Following'}</Text>
      <FlatList
        data={users}
        keyExtractor={(u) => u.uuid}
        renderItem={renderUser}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923', paddingTop: 48 },
  back: { padding: 16 },
  backText: { color: '#00b4d8' },
  title: { color: '#fff', fontWeight: '700', fontSize: 22, paddingHorizontal: 16, paddingBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#00b4d8', alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontWeight: '700', fontSize: 16 },
  name: { color: '#fff', fontWeight: '600', fontSize: 15 },
})
