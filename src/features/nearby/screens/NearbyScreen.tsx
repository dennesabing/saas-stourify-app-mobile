import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import * as Location from 'expo-location'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { DiscoverStackParamList } from '@/shared/navigation/types'
import { getNearbyFeed } from '@/shared/api/feed'
import { EmptyState, PostCard } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'
import { MapCanvas, type MapPin } from '@/shared/map'
import type { Post } from '@/shared/api/types'

type Props = NativeStackScreenProps<DiscoverStackParamList, 'Nearby'>

/**
 * How long to wait for a live fix before settling for the last known position.
 *
 * A timeout rather than a `.catch`, because the failure this guards against
 * does not reject: on an emulator whose fused provider is never driven,
 * `getCurrentPositionAsync` simply never settles, so an error handler is never
 * reached and the screen sits on its spinner forever.
 */
const POSITION_TIMEOUT_MS = 8000

interface Coords {
  lat: number
  lng: number
}

/**
 * What the screen knows about where the viewer is. A single boolean cannot
 * carry this: "permission refused" and "permission granted, no fix" need
 * different copy and different remedies.
 */
type LocationState = 'locating' | 'ready' | 'permission-denied' | 'unavailable'

function toCoords(loc: Location.LocationObject | null): Coords | null {
  return loc ? { lat: loc.coords.latitude, lng: loc.coords.longitude } : null
}

/** A live fix if one arrives in time, else the last one the device recorded. */
async function readPosition(): Promise<Coords | null> {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    const current = await Promise.race([
      Location.getCurrentPositionAsync({}),
      new Promise<Location.LocationObject | null>((resolve) => {
        timer = setTimeout(() => resolve(null), POSITION_TIMEOUT_MS)
      }),
    ])
    const coords = toCoords(current)
    if (coords) return coords
  } catch {
    // No live fix. The last known position may still be usable.
  } finally {
    if (timer) clearTimeout(timer)
  }

  try {
    return toCoords(await Location.getLastKnownPositionAsync())
  } catch {
    return null
  }
}
/** Pin ids are post uuids, so the viewer's own pin needs one that cannot collide. */
const YOU_PIN_ID = 'viewer-location'

export default function NearbyScreen({ navigation }: Props) {
  const theme = useTheme()
  const [location, setLocation] = useState<Coords | null>(null)
  const [radius, setRadius] = useState(10)
  const [locationState, setLocationState] = useState<LocationState>('locating')
  const [attempt, setAttempt] = useState(0)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function acquire() {
      let granted = false
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        granted = status === 'granted'
      } catch {
        granted = false
      }
      if (cancelled) return
      if (!granted) {
        setLocationState('permission-denied')
        return
      }

      const coords = await readPosition()
      if (cancelled) return
      if (!coords) {
        setLocationState('unavailable')
        return
      }

      setLocation(coords)
      setLocationState('ready')
    }

    setLocationState('locating')
    void acquire()

    return () => { cancelled = true }
  }, [attempt])

  const { data, isLoading } = useQuery({
    queryKey: ['nearby', location?.lat, location?.lng, radius],
    queryFn: () => getNearbyFeed(location!.lat, location!.lng, radius),
    enabled: !!location,
  })

  const posts = data?.data ?? []

  /** A pin per post that has a spot, plus one for the viewer. Ids are post uuids. */
  const pins = useMemo<MapPin[]>(() => {
    const spotPins: MapPin[] = posts.flatMap((post) =>
      post.spot
        ? [
            {
              id: post.uuid,
              coordinate: { latitude: post.spot.latitude, longitude: post.spot.longitude },
              title: post.spot.title,
              kind: 'spot' as const,
            },
          ]
        : [],
    )

    if (!location) return spotPins

    return [
      ...spotPins,
      {
        id: YOU_PIN_ID,
        coordinate: { latitude: location.lat, longitude: location.lng },
        title: 'You',
        kind: 'you' as const,
      },
    ]
  }, [posts, location])

  const selectedPost = posts.find((post) => post.uuid === selectedPinId)

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

  // The full-screen states carry a themed background rather than the map
  // chrome's dark literal: the design-system `EmptyState` draws its title in
  // `ink`, which is near-black under the light palette and unreadable on it.
  const emptyStateBackground = { backgroundColor: theme.colors.surface }

  if (locationState === 'permission-denied') {
    return (
      <View style={[styles.container, emptyStateBackground]}>
        <EmptyState
          icon="📍"
          title="Location access needed"
          subtitle="Enable location in Settings to see nearby spots"
        />
      </View>
    )
  }

  // Permission is fine — the device just could not produce a position. Say so,
  // and offer another attempt here rather than sending anyone to a setting
  // that is already correct.
  if (locationState === 'unavailable') {
    return (
      <View style={[styles.container, emptyStateBackground]}>
        <EmptyState
          icon="🛰️"
          title="Can't pin down your location"
          subtitle="Location is on, but no fix came through. Move somewhere with a clearer view of the sky, then try again."
          actionLabel="Try again"
          onAction={() => setAttempt((n) => n + 1)}
        />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {location ? (
        <MapCanvas
          testID="nearby-map"
          style={styles.map}
          region={{ center: { latitude: location.lat, longitude: location.lng }, radiusKm: radius }}
          pins={pins}
          selectedPinId={selectedPinId}
          onSelectPin={setSelectedPinId}
          onRecenter={() => setSelectedPinId(null)}
          renderPeekCard={() =>
            selectedPost ? (
              <PostCard
                post={selectedPost}
                onPress={() => {
                  if (selectedPost.spot?.uuid)
                    navigation.navigate('SpotDetail', { spotId: selectedPost.spot.uuid })
                }}
              />
            ) : null
          }
        />
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
