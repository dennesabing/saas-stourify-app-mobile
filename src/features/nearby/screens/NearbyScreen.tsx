import { useState, useEffect, useCallback, useMemo } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useQuery } from '@tanstack/react-query'
import * as Location from 'expo-location'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { DiscoverStackParamList } from '@/shared/navigation/types'
import { getNearbySpots } from '@/shared/api/spots'
import { ratingFor, thumbFor } from '@/features/discover/api/exploreSpots'
import { BarHeader, EmptyState, Icon, SpotCard, Tag, Text } from '@/shared/components/ui'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { useTheme, type Theme } from '@/theme/ThemeProvider'
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

/** List first, map on request (STOURIFY-259) — the toggle in the header swaps this. */
type ViewMode = 'list' | 'map'

/** The radius chip's stops, and the order it cycles through on tap (STOURIFY-259). */
const RADII = [5, 10, 25, 50] as const

function nextRadius(radius: number): number {
  const index = RADII.indexOf(radius as (typeof RADII)[number])
  return RADII[(index + 1) % RADII.length]
}

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
 * The list's two no-rows sentences. Held as constants because the row's
 * `accessibilityLabel` says the same thing as its visible text, and a screen
 * reader announcing something the screen does not show is its own small lie.
 */
const LIST_FAILURE_TITLE = "Couldn't load nearby spots"
const LIST_RETRY_HINT = 'Tap to retry'
const LIST_EMPTY_TEXT = 'No spots nearby'

/**
 * The peek card's line — "1.2 km away" — kept exactly as it was, since the
 * map peek (artboard 4) is untouched by this card.
 */
function distanceLabel(spot: Spot): string | null {
  return spot.distance_km == null ? null : `${spot.distance_km.toFixed(1)} km away`
}

/**
 * The list row's distance, per the design's `.lcard` meta line — "· 1.2 km"
 * rather than "1.2 km away", because the row already reads left to right as
 * category → rating → distance and "away" is redundant there (STOURIFY-259).
 * Nullability and precision follow `distanceLabel`'s rule: a missing value is
 * "not applicable", never zero, so it renders nothing.
 */
function compactDistanceLabel(spot: Spot): string | null {
  return spot.distance_km == null ? null : `${spot.distance_km.toFixed(1)} km`
}

/**
 * Shown wherever the screen has asked for a position and none has arrived
 * yet — the list's own empty state (see `listEmpty` below) and the map slot
 * both reduce to the same wait, so both draw this. Themed in `primary`
 * (STOURIFY-259); the screen's old hardcoded dark chrome and its `#00b4d8`
 * spinner are gone along with the rest of the literals.
 */
function LocatingPanel() {
  const theme = useTheme()

  return (
    <View style={styles.locating}>
      <ActivityIndicator color={theme.colors.primary} size="large" />
      <Text variant="body" color="muted" style={{ marginTop: theme.spacing[3] }}>
        Finding where you are…
      </Text>
    </View>
  )
}

/** The summary row's right-hand control — cycles 5 → 10 → 25 → 50 → 5 km (STOURIFY-259). */
function RadiusChip({ radius, onPress }: { radius: number; onPress: () => void }) {
  const theme = useTheme()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Within ${radius} km. Tap to change.`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.radiusChip,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.hairline,
          paddingHorizontal: theme.spacing[3],
          paddingVertical: theme.spacing[2],
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Icon name="sort" size={15} />
      <Text variant="caption" color="ink" style={{ fontFamily: theme.fontFamily.bodySemiBold }}>
        Within {radius} km
      </Text>
    </Pressable>
  )
}

/**
 * A `.lcard` row: a fixed-width photo beside a body of title, category and
 * distance. Not `SpotCard`, whose `wide` layout stacks its meta under the
 * title — this row keeps everything on one line beside a taller photo, per
 * the Nearby artboard rather than the generic card (STOURIFY-259).
 */
function NearbyListRow({ spot, onPress }: { spot: Spot; onPress: () => void }) {
  const theme = useTheme()
  const category = spot.categories?.[0]
  const distance = compactDistanceLabel(spot)
  const thumb = thumbFor(spot)
  const rating = ratingFor(spot)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spot.title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.hairline,
          marginHorizontal: theme.gutter,
          marginBottom: theme.spacing[3],
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <Image
        testID="nearby-row-image"
        source={thumb ? { uri: thumb } : undefined}
        style={[styles.rowImage, { backgroundColor: theme.colors.surfaceAlt }]}
        contentFit="cover"
        transition={theme.motion.fast}
      />

      <View style={styles.rowBody}>
        <Text
          numberOfLines={2}
          color="ink"
          style={{
            fontFamily: theme.fontFamily.displaySemiBold,
            fontSize: 16,
            lineHeight: 20,
          }}
        >
          {spot.title}
        </Text>

        <View style={styles.rowMeta}>
          {category ? <Tag label={category} /> : null}
          {rating != null ? (
            <Text
              variant="caption"
              style={{ color: theme.colors.accent2, fontFamily: theme.fontFamily.bodySemiBold }}
            >
              ★ {rating.toFixed(1)}
            </Text>
          ) : null}
          {distance ? (
            <Text variant="caption" color="muted">
              · {distance}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

export default function NearbyScreen({ navigation }: Props) {
  const theme = useTheme()
  const [location, setLocation] = useState<Coords | null>(null)
  const [radius, setRadius] = useState(10)
  const [locationState, setLocationState] = useState<LocationState>('locating')
  const [attempt, setAttempt] = useState(0)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')

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

  // Named once and read in two places — the query's gate below and the
  // list's first branch — so the two can never drift apart. The list has to
  // know whether the request was ever made, and this is the fact that
  // decides it.
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

  const renderItem = useCallback(
    ({ item }: { item: Spot }) => (
      <NearbyListRow
        spot={item}
        onPress={() => navigation.navigate('SpotDetail', { spotId: item.uuid })}
      />
    ),
    [navigation],
  )

  /**
   * The list with nothing in it. Four situations — "we have not asked yet",
   * "we are asking", "we could not ask", and "we asked and there is nothing
   * here" — and only the last of them is about the area the viewer is standing
   * in.
   *
   * Before STOURIFY-60 there were two branches and a failed request fell into
   * the empty one, so the list said "No spots nearby" — a claim about the area
   * the viewer is standing in — when the truth was a claim about the network. A
   * reader told the area is empty walks somewhere else, which is the one move
   * that cannot help.
   *
   * **`hasPosition` is asked before everything else** (STOURIFY-66). The spots
   * request is switched off until a position exists, and `isLoading` means
   * *pending AND fetching* — so a query that has never started reads `false`,
   * the identical value a query that finished with nothing reads. Without this
   * branch the list printed "No spots nearby" for the eight seconds the phone
   * spends working out where it is: a confident answer to a question that had
   * not been put.
   *
   * It used to render nothing here, on the reasoning that the map above
   * already carried a spinner for the same wait — true only while the map was
   * always on screen. Now that list is the default view, this branch renders
   * `LocatingPanel` instead, so the reader is not left looking at a bare list
   * for eight seconds (STOURIFY-259). The map slot still falls back to the
   * same panel when this screen is toggled to map view before a fix arrives.
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
   * The failure row stays local to this screen rather than the design-system
   * `EmptyState`: this suite's retry is a tap anywhere on the row's own text
   * (`LIST_FAILURE_TITLE`), not a separate button, and swapping to `EmptyState`
   * would need a second interactive element to do the same job for no gain.
   * It is themed and now fills the list's height instead of the old 200px
   * strip (STOURIFY-259).
   */
  const listEmpty = useCallback(() => {
    if (!hasPosition) return <LocatingPanel />

    // A first fetch with nothing cached. It used to render nothing because the
    // map above carried a spinner for this wait; with the list as the default
    // view that left a bare page, found on the emulator (STOURIFY-259). The
    // backend can take several seconds on a cold start, so this wait is real.
    if (isLoading) {
      return (
        <View style={styles.locating}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text variant="body" color="muted" style={{ marginTop: theme.spacing[3] }}>
            Finding spots nearby…
          </Text>
        </View>
      )
    }

    if (isError) {
      return (
        <Pressable
          style={styles.listMessage}
          onPress={() => void refetch()}
          accessibilityRole="button"
          accessibilityLabel={`${LIST_FAILURE_TITLE}. ${LIST_RETRY_HINT}.`}
        >
          <Text variant="body" color="ink">
            {LIST_FAILURE_TITLE}
          </Text>
          <Text variant="caption" color="primary" style={{ marginTop: theme.spacing[1] }}>
            {LIST_RETRY_HINT}
          </Text>
        </Pressable>
      )
    }

    return (
      <View style={styles.listMessage}>
        <Text variant="body" color="muted">
          {LIST_EMPTY_TEXT}
        </Text>
      </View>
    )
  }, [hasPosition, isLoading, isError, refetch, theme])

  if (locationState === 'permission-denied') {
    return (
      <SafeAreaView
        edges={['top']}
        style={[styles.container, { backgroundColor: theme.colors.surface }]}
      >
        <EmptyState
          icon="📍"
          title="Location access needed"
          subtitle="Enable location in Settings to see nearby spots"
        />
      </SafeAreaView>
    )
  }

  // Permission is fine — the device just could not produce a position. Say so,
  // and offer another attempt here rather than sending anyone to a setting
  // that is already correct.
  if (locationState === 'unavailable') {
    return (
      <SafeAreaView
        edges={['top']}
        style={[styles.container, { backgroundColor: theme.colors.surface }]}
      >
        <EmptyState
          icon="🛰️"
          title="Can't pin down your location"
          subtitle="Location is on, but no fix came through. Move somewhere with a clearer view of the sky, then try again."
          actionLabel="Try again"
          onAction={() => setAttempt((n) => n + 1)}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: theme.colors.surface }]}
    >
      <BarHeader
        title="Nearby"
        onBack={navigation.goBack}
        right={<ViewToggle theme={theme} viewMode={viewMode} onToggle={setViewMode} />}
      />

      {hasPosition ? (
        <View
          style={[
            styles.summaryRow,
            { paddingHorizontal: theme.gutter, paddingBottom: theme.spacing[3] },
          ]}
        >
          {/* No count until the answer is in: "0 spots" during the first load
              states something nobody knows yet (STOURIFY-259, seen on the
              emulator). */}
          <Text variant="caption" color="muted">
            {isLoading
              ? `Finding spots within ${radius} km…`
              : `${spots.length} spot${spots.length === 1 ? '' : 's'} within ${radius} km`}
          </Text>
          <RadiusChip radius={radius} onPress={() => setRadius(nextRadius(radius))} />
        </View>
      ) : null}

      {viewMode === 'list' ? (
        <FlatList
          data={spots}
          keyExtractor={(item) => item.uuid}
          renderItem={renderItem}
          ListEmptyComponent={listEmpty}
          contentContainerStyle={styles.listContent}
          style={styles.list}
        />
      ) : location ? (
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
                rating={ratingFor(selectedSpot)}
                reviewCount={selectedSpot.reviews_count}
                meta={distanceLabel(selectedSpot)}
                onPress={() => navigation.navigate('SpotDetail', { spotId: selectedSpot.uuid })}
              />
            ) : null
          }
        />
      ) : (
        <View style={[styles.map, { backgroundColor: theme.colors.surfaceAlt }]}>
          <LocatingPanel />
        </View>
      )}
    </SafeAreaView>
  )
}

/**
 * The header's right-hand control: swaps the body between the list and the
 * map, per STOURIFY-259. A 38pt disc like `BarHeader`'s own back button,
 * answering to the full 44pt target the same way — via `hitSlop` rather than
 * a bigger disc, so the two controls read as one family.
 */
function ViewToggle({
  theme,
  viewMode,
  onToggle,
}: {
  theme: Theme
  viewMode: ViewMode
  onToggle: (mode: ViewMode) => void
}) {
  const slop = (theme.minTouchTarget - 38) / 2

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={viewMode === 'list' ? 'Show map' : 'Show list'}
      hitSlop={slop}
      onPress={() => onToggle(viewMode === 'list' ? 'map' : 'list')}
      style={({ pressed }) => [
        styles.toggle,
        { backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Icon name={viewMode === 'list' ? 'map' : 'list'} size={20} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toggle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  radiusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
  },
  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingTop: 4 },
  listMessage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 96,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  rowImage: { width: 104, height: '100%' },
  rowBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
    paddingTop: 11,
    paddingRight: 12,
    paddingBottom: 11,
  },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  map: { flex: 1 },
  locating: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
