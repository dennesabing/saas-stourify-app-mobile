import { useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import type { CompositeNavigationProp } from '@react-navigation/native'
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack'
import type { NearbyStackParamList, SearchStackParamList } from '@/shared/navigation/types'
import { getSpot, getSpotPosts } from '@/shared/api/spots'
import type { Post } from '@/shared/api/types'

const { width } = Dimensions.get('window')
const THUMB = (width - 4) / 3

type SpotDetailNavProp = CompositeNavigationProp<
  NativeStackNavigationProp<SearchStackParamList, 'SpotDetail'>,
  NativeStackNavigationProp<NearbyStackParamList>
>

type Props = {
  navigation: SpotDetailNavProp
  route: NativeStackScreenProps<SearchStackParamList, 'SpotDetail'>['route']
}

export default function SpotDetailScreen({ route, navigation }: Props) {
  const { spotId } = route.params
  const [tab, setTab] = useState<'Posts' | 'About'>('Posts')

  const { data: spot } = useQuery({
    queryKey: ['spot', spotId],
    queryFn: () => getSpot(spotId),
  })

  const { data: postsData } = useQuery({
    queryKey: ['spot-posts', spotId],
    queryFn: () => getSpotPosts(spotId),
  })

  const posts = postsData?.data ?? []

  const renderThumb = useCallback(
    ({ item }: { item: Post }) => (
      <TouchableOpacity
        onPress={() => navigation.navigate('PostDetail', { postId: item.uuid })}
      >
        <View style={[styles.thumb, { backgroundColor: '#1a3040' }]}>
          {item.media?.[0] && (
            <Image source={{ uri: item.media[0].url }} style={styles.thumbImg} />
          )}
        </View>
      </TouchableOpacity>
    ),
    [navigation],
  )

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.hero} />

      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={styles.name}>{spot?.name ?? '...'}</Text>
          {spot?.status === 'active' && (
            <View style={styles.verified}><Text style={styles.verifiedText}>✓ Verified</Text></View>
          )}
        </View>
        {spot?.category && (
          <View style={styles.chip}><Text style={styles.chipText}>📍 {spot.category.name}</Text></View>
        )}
      </View>

      <View style={styles.tabs}>
        {(['Posts', 'About'] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'Posts' ? (
        <FlatList
          data={posts}
          numColumns={3}
          keyExtractor={(p) => p.uuid}
          renderItem={renderThumb}
          contentContainerStyle={{ gap: 2 }}
          columnWrapperStyle={{ gap: 2 }}
        />
      ) : (
        <View style={styles.about}>
          {spot?.description ? <Text style={styles.desc}>{spot.description}</Text> : null}
          {spot?.address ? <Text style={styles.addr}>📍 {spot.address}</Text> : null}
          <Text style={styles.coords}>
            {spot?.latitude?.toFixed(4)}, {spot?.longitude?.toFixed(4)}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  back: { position: 'absolute', top: 48, left: 16, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8 },
  backText: { color: '#fff' },
  hero: { height: 220, backgroundColor: '#1a3040' },
  info: { padding: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  name: { fontSize: 22, fontWeight: 'bold', color: '#fff', flex: 1 },
  verified: { backgroundColor: 'rgba(0,200,100,0.2)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  verifiedText: { color: '#0c6', fontSize: 12 },
  chip: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,180,216,0.15)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: '#00b4d8', fontSize: 13 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#00b4d8' },
  tabText: { color: '#888', fontWeight: '600' },
  tabTextActive: { color: '#00b4d8' },
  thumb: { width: THUMB, height: THUMB },
  thumbImg: { width: THUMB, height: THUMB },
  about: { padding: 16, gap: 8 },
  desc: { color: '#eee', fontSize: 15, lineHeight: 22 },
  addr: { color: '#aaa', fontSize: 14 },
  coords: { color: '#555', fontSize: 12 },
})
