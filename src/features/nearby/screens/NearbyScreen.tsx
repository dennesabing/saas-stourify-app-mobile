import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import * as Location from 'expo-location'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { DiscoverStackParamList } from '@/shared/navigation/types'
import { getNearbySpots } from '@/shared/api/spots'
import { EmptyState, SpotCard } from '@/shared/components/ui'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { useTheme } from '@/theme/ThemeProvider'
import { MapCanvas, spotPins, type MapPin } from '@/shared/map'
import type { Spot } from '@/shared/api/types'

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
/** Pin ids are spot uuids, so the viewer's own pin needs one that cannot collide. */
const YOU_PIN_ID = 'viewer-location'

/**
 * The failure row's two lines. Held as constants because the row's
 * `accessibilityLabel` says the same thing as its visible text, and a screen
 * reader announcing something the screen does not show is its own small lie.
 */
const STRIP_FAILURE_TITLE = "Couldn't load nearby spots"
const STRIP_RETRY_HINT = 'Tap to retry'

/**
 * The strip's secondary line. `distance_km` is present only on responses from
 * `/spots/nearby`, and only there does "how far away" mean anything — a missing
 * value is "not applicable", never zero, so it renders nothing at all.
 */
function distanceLabel(spot: Spot): string | null {
  return spot.distance_km == null ? null : `${spot.distance_km.toFixed(1)} km away`
}

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

    return () => {
      cancelled = true
    }
  }, [attempt])

  // Named once and read in two places — the query's gate below and the strip's
  // first branch — so the two can never drift apart. The strip has to know
  // whether the request was ever made, and this is the fact that decides it.
  const hasPosition = !!location

  // Spots, not posts. `/spots/nearby` is the only proximity route the server
  // has; the feed has no nearby variant and never had one (STOURIFY-8). The
  // server orders by distance, so the response order is rendered as received.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['nearby', location?.lat, location?.lng, radius],
    queryFn: () => getNearbySpots(location!.lat, location!.lng, radius),
    enabled: hasPosition,
  })

  // Ask again when this screen comes back into view. React Navigation keeps
  // it mounted, so returning to a nearby list you looked at earlier would
  // otherwise show that earlier answer -- including "No spots nearby" for a
  // spot you added in between (STOURIFY-200).
  useRefetchOnFocus(navigation, refetch)

  const spots = data?.data ?? []

  /** A pin per spot, plus one for the viewer. Ids are spot uuids. */
  const pins = useMemo<MapPin[]>(() => {
    const placed = spotPins(spots)

    if (!location) return placed

    return [
      ...placed,
      {
        id: YOU_PIN_ID,
        coordinate: { latitude: location.lat, longitude: location.lng },
        title: 'You',
        kind: 'you' as const,
      },
    ]
  }, [spots, location])

  const selectedSpot = spots.find((spot) => spot.uuid === selectedPinId)

  // `wide` rather than `tall`: the strip is capped at 200px and a tall card is
  // a 160px image plus its text, so the title and the distance fall below the
  // fold — pins on the map with no legible list under them. Found on the
  // emulator, not by reading the code.
  const renderItem = useCallback(
    ({ item }: { item: Spot }) => (
      <View style={{ width: 280 }}>
        <SpotCard
          layout="wide"
          title={item.title}
          category={item.categories?.[0]}
          imageUri={item.media?.[0]?.url}
          rating={item.rating_average}
          reviewCount={item.reviews_count}
          meta={distanceLabel(item)}
          onPress={() => navigation.navigate('SpotDetail', { spotId: item.uuid })}
        />
      </View>
    ),
    [navigation],
  )

  /**
   * The strip with nothing in it. Four situations — "we have not asked yet",
   * "we are asking", "we could not ask", and "we asked and there is nothing
   * here" — and only the last of them is about the area the viewer is standing
   * in.
   *
   * Before STOURIFY-60 there were two branches and a failed request fell into
   * the empty one, so the strip said "No spots nearby" — a claim about the area
   * the viewer is standing in — when the truth was a claim about the network. A
   * reader told the area is empty walks somewhere else, which is the one move
   * that cannot help.
   *
   * **`hasPosition` is asked before everything else** (STOURIFY-66). The spots
   * request is switched off until a position exists, and `isLoading` means
   * *pending AND fetching* — so a query that has never started reads `false`,
   * the identical value a query that finished with nothing reads. Without this
   * branch the strip printed "No spots nearby" for the eight seconds the phone
   * spends working out where it is: a confident answer to a question that had
   * not been put. It renders nothing rather than a spinner of its own, because
   * the map above is already showing one for the same wait.
   *
   * Two further orderings are load-bearing, and they match `FeedScreen` and
   * `DiscoverScreen` for the same reasons:
   *
   * **This lives inside `ListEmptyComponent`**, which renders only when the
   * list has no rows at all — so content always wins over an error. A refetch
   * that fails while spots are on screen leaves those spots alone. Hoisting an
   * `isError` check above the `FlatList` would delete that, and would never
   * once show that it had, because the branch is unreachable while online.
   *
   * **`isLoading` is asked before `isError`.** `isLoading` is true only for a
   * first fetch with nothing cached, so a slow first load must not show a
   * failure. `isError` then stays true through a retry until one succeeds,
   * which keeps the failure row up while the retry is in flight rather than
   * flickering to "No spots nearby" and back.
   *
   * The failure row is local to this screen rather than the design-system
   * `EmptyState` the other two use: the strip is capped at 200px, and an
   * `EmptyState` block's icon, heading, paragraph and button do not fit inside
   * that. A retry the reader cannot reach is worse than the wrong sentence.
   */
  const stripEmpty = useCallback(() => {
    if (!hasPosition) return null

    if (isLoading) return null

    if (isError) {
      return (
        <TouchableOpacity
          style={styles.emptyStrip}
          onPress={() => void refetch()}
          accessibilityRole="button"
          accessibilityLabel={`${STRIP_FAILURE_TITLE}. ${STRIP_RETRY_HINT}.`}
        >
          <Text style={styles.errorText}>{STRIP_FAILURE_TITLE}</Text>
          <Text style={styles.retryText}>{STRIP_RETRY_HINT}</Text>
        </TouchableOpacity>
      )
    }

    return (
      <View style={styles.emptyStrip}>
        <Text style={styles.emptyText}>No spots nearby</Text>
      </View>
    )
  }, [hasPosition, isLoading, isError, refetch])

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
            selectedSpot ? (
              <SpotCard
                layout="wide"
                title={selectedSpot.title}
                category={selectedSpot.categories?.[0]}
                imageUri={selectedSpot.media?.[0]?.url}
                rating={selectedSpot.rating_average}
                reviewCount={selectedSpot.reviews_count}
                meta={distanceLabel(selectedSpot)}
                onPress={() => navigation.navigate('SpotDetail', { spotId: selectedSpot.uuid })}
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
        data={spots}
        horizontal
        keyExtractor={(item) => item.uuid}
        renderItem={renderItem}
        ListEmptyComponent={stripEmpty}
        contentContainerStyle={{ padding: 8 }}
        style={styles.strip}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  map: { flex: 1 },
  radiusBar: {
    backgroundColor: 'rgba(15,25,35,0.95)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  radiusText: { color: '#fff', fontSize: 14 },
  radiusBtns: { flexDirection: 'row', gap: 8 },
  radiusBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  radiusBtnActive: { backgroundColor: '#00b4d8' },
  radiusBtnText: { color: '#fff', fontSize: 12 },
  strip: { maxHeight: 200, backgroundColor: '#0f1923' },
  emptyStrip: { padding: 32 },
  emptyText: { color: '#aaa' },
  // Literals, matching the strip chrome above rather than the theme. The
  // strip's own background is a hardcoded dark `#0f1923` that does not follow
  // the palette, so a token drawn from the light theme would land near-black on
  // it and vanish — the regression STOURIFY-20's live run caught on this very
  // screen. `#00b4d8` is the accent the radius buttons and the map spinner
  // already use. See the ASSUMPTION note on STOURIFY-60.
  errorText: { color: '#fff', fontSize: 14 },
  retryText: { color: '#00b4d8', fontSize: 13, marginTop: 4 },
  mapPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d1820' },
})
