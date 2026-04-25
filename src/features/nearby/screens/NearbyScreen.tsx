import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { useQuery } from '@tanstack/react-query'
import * as Location from 'expo-location'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { NearbyStackParamList } from '@/shared/navigation/types'
import { getNearbyFeed } from '@/shared/api/feed'
import PostCard from '@/shared/components/PostCard'
import EmptyState from '@/shared/components/EmptyState'
import type { Post } from '@/shared/api/types'

type Props = NativeStackScreenProps<NearbyStackParamList, 'Nearby'>

export default function NearbyScreen({ navigation }: Props) {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [radius, setRadius] = useState(10)
  const [permissionDenied, setPermissionDenied] = useState(false)

  useEffect(() => {
    let cancelled = false
    Location.requestForegroundPermissionsAsync()
      .then(({ status }) => {
        if (cancelled) return
        if (status !== 'granted') {
          setPermissionDenied(true)
          return
        }
        return Location.getCurrentPositionAsync({})
      })
      .then((loc) => {
        if (cancelled || !loc) return
        setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude })
      })
      .catch(() => {
        if (!cancelled) setPermissionDenied(true)
      })
    return () => { cancelled = true }
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['nearby', location?.lat, location?.lng, radius],
    queryFn: () => getNearbyFeed(location!.lat, location!.lng, radius),
    enabled: !!location,
  })

  const posts = data?.data ?? []

  const renderItem = useCallback(
    ({ item }: { item: Post }) => (
      <View style={{ width: 280 }}>
        <PostCard
          post={item}
          onPress={() => {
            if (item.spot?.uuid) navigation.navigate('SpotDetail', { spotId: item.spot.uuid })
          }}
        />
      </View>
    ),
    [navigation],
  )

  if (permissionDenied) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="📍"
          title="Location access needed"
          subtitle="Enable location in Settings to see nearby spots"
        />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {location ? (
        <MapView
          style={styles.map}
          region={{
            latitude: location.lat,
            longitude: location.lng,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          }}
        >
          {posts.map((post) =>
            post.spot ? (
              <Marker
                key={post.uuid}
                coordinate={{ latitude: post.spot.latitude, longitude: post.spot.longitude }}
                title={post.spot.name}
              />
            ) : null
          )}
          <Marker
            coordinate={{ latitude: location.lat, longitude: location.lng }}
            pinColor="blue"
            title="You"
          />
        </MapView>
      ) : (
        <View style={[styles.map, styles.mapPlaceholder]}>
          <ActivityIndicator color="#00b4d8" size="large" />
        </View>
      )}

      <View style={styles.radiusBar}>
        <Text style={styles.radiusText}>📍 Radius: {radius} km</Text>
        <View style={styles.radiusBtns}>
          {[5, 10, 25, 50].map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.radiusBtn, radius === r && styles.radiusBtnActive]}
              onPress={() => setRadius(r)}
            >
              <Text style={styles.radiusBtnText}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={posts}
        horizontal
        keyExtractor={(item) => item.uuid}
        renderItem={renderItem}
        ListEmptyComponent={
          !isLoading
            ? () => (
                <View style={styles.emptyStrip}>
                  <Text style={styles.emptyText}>No spots nearby</Text>
                </View>
              )
            : null
        }
        contentContainerStyle={{ padding: 8 }}
        style={styles.strip}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  map: { flex: 1 },
  radiusBar: { backgroundColor: 'rgba(15,25,35,0.95)', padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  radiusText: { color: '#fff', fontSize: 14 },
  radiusBtns: { flexDirection: 'row', gap: 8 },
  radiusBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' },
  radiusBtnActive: { backgroundColor: '#00b4d8' },
  radiusBtnText: { color: '#fff', fontSize: 12 },
  strip: { maxHeight: 200, backgroundColor: '#0f1923' },
  emptyStrip: { padding: 32 },
  emptyText: { color: '#aaa' },
  mapPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d1820' },
})
