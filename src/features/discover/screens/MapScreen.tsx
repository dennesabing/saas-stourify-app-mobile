import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useDatabase } from '@nozbe/watermelondb/react'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SpotCard } from '@/shared/components/ui'
import { requestPosition } from '@/shared/location/position'
import {
  DEFAULT_MAP_CENTER,
  MapCanvas,
  readFallbackCenter,
  spotPins,
  type MapCoordinate,
  type MapPin,
} from '@/shared/map'
import type { DiscoverStackParamList } from '@/shared/navigation/types'
import type { Spot } from '@/shared/api/types'
import { useTheme } from '@/theme/ThemeProvider'
import { EXPLORE_SPOTS_QUERY_KEY, fetchExploreSpots, thumbFor } from '../api/exploreSpots'

type Props = NativeStackScreenProps<DiscoverStackParamList, 'Map'>

/**
 * How much ground the map opens on. Roughly a city's worth — close enough that
 * the pins are places you could walk between, wide enough that an empty screen
 * is a real statement about the area rather than about the zoom.
 */
const EXPLORE_RADIUS_KM = 8

/**
 * Discover's map — the same spots as the grid, arranged by where they are.
 *
 * The grid answers "what is there". This answers "what is near the thing I am
 * looking at", which is the question somebody standing in a city actually has.
 * Three things about it are worth knowing before changing it.
 *
 * **It is not Nearby.** `NearbyScreen` asks what is within N kilometres of *you*
 * and refuses to draw a map at all without a fix from the device, which is
 * correct for that question. This one asks what is around *here*, so it always
 * opens on something: the device's position if there is one, the explorer's home
 * city if not, and General Santos as the last resort. An emulator with no fix —
 * the usual state — still gets a map.
 *
 * **It reads the grid's query, under the grid's key.** A spot behind a pin and
 * the same spot in the grid are one object, one fetch and one cached page, so
 * the map draws from disk with no signal exactly as the grid does.
 *
 * **It names no map library.** Every affordance here — pins, controlled
 * selection, the peek card, recenter — belongs to `@/shared/map`, and
 * `__tests__/shared/map/vendorIsolation.test.ts` fails the build if this file
 * learns what is installed.
 */
export default function MapScreen({ navigation }: Props) {
  const theme = useTheme()
  const database = useDatabase()

  // Held as one coordinate, seeded synchronously, so the map is mounted on the
  // very first frame and never waits behind a permission dialog.
  const [center, setCenter] = useState<MapCoordinate>(DEFAULT_MAP_CENTER)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function locate(): Promise<void> {
      // The local read first, and on its own: it always resolves, it costs a
      // database query, and it moves the map off the last-resort centre while
      // the far slower permission-and-fix round trip is still running.
      const fallback = await readFallbackCenter(database)
      if (cancelled) return
      setCenter(fallback)

      const result = await requestPosition()
      if (cancelled) return
      if (result.status === 'granted' && result.fix) setCenter(result.fix.coordinate)
    }

    void locate()

    return () => {
      cancelled = true
    }
  }, [database])

  const { data } = useQuery({
    // The map shows everything, so it asks for the unfiltered page — the same
    // one Discover's "All" chip uses, and deliberately the same cache entry.
    //
    // The arrow around the fetcher is not style. React Query calls a query
    // function with its own context object as the first argument, so passing
    // `fetchExploreSpots` bare would hand that object in as the category and
    // send it to the server as a filter (STOURIFY-193).
    queryKey: EXPLORE_SPOTS_QUERY_KEY(),
    queryFn: () => fetchExploreSpots(),
  })

  const spots = useMemo(() => data ?? [], [data])

  /**
   * A pin per spot, keyed by uuid exactly as `NearbyScreen` keys its pins — the
   * id a tap comes back as is then the id that opens the spot, with nothing to
   * look up in between.
   *
   * Which spots may be drawn is `spotPins`' rule, shared with `NearbyScreen`
   * (STOURIFY-240): a spot the server sent without coordinates is dropped
   * rather than pinned at `(0, 0)`, which is a real place in the Atlantic and
   * would sit the map's only pin a hemisphere away from every other one.
   */
  const pins = useMemo<MapPin[]>(() => spotPins(spots), [spots])

  const region = useMemo(() => ({ center, radiusKm: EXPLORE_RADIUS_KM }), [center])

  const selectedSpot = spots.find((spot: Spot) => spot.uuid === selectedPinId)

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      <MapCanvas
        testID="discover-map"
        region={region}
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
              // The small photo, for the same reason a grid cell uses it, and
              // with the same deliberate absence of a fallback to the original.
              imageUri={thumbFor(selectedSpot)}
              rating={selectedSpot.rating_average}
              reviewCount={selectedSpot.reviews_count}
              meta={selectedSpot.address}
              onPress={() => navigation.navigate('SpotDetail', { spotId: selectedSpot.uuid })}
            />
          ) : null
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
})
