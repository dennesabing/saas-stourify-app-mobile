import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDatabase } from '@nozbe/watermelondb/react'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Chip, Icon, SearchField } from '@/shared/components/ui'
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
import { SPOT_CATEGORIES } from '@/shared/config/spotCategories'
import {
  EXPLORE_SPOTS_QUERY_KEY,
  fetchExploreSpots,
  ratingFor,
  thumbFor,
} from '../api/exploreSpots'
import PeekCard from '../components/PeekCard'

type Props = NativeStackScreenProps<DiscoverStackParamList, 'Map'>

/**
 * How much ground the map opens on. Roughly a city's worth — close enough that
 * the pins are places you could walk between, wide enough that an empty screen
 * is a real statement about the area rather than about the zoom.
 */
const EXPLORE_RADIUS_KM = 8

/** Same rail as Discover's, and the same word for "do not filter". */
const ALL_FILTER = 'All'
const FILTERS = [ALL_FILTER, ...SPOT_CATEGORIES]

/**
 * How far above the peek card's own zone the floating list button sits
 * (STOURIFY-259). `MapCanvas` anchors the peek card at `bottom: spacing[3]`
 * and the card itself runs about 86 points tall, so this clears it with room
 * to spare whether or not a peek card is actually showing right now.
 */
const LIST_BUTTON_CLEARANCE = 120

/**
 * Discover's map — the same spots as the grid, arranged by where they are.
 *
 * The grid answers "what is there". This answers "what is near the thing I am
 * looking at", which is the question somebody standing in a city actually has.
 * Four things about it are worth knowing before changing it.
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
 * the map draws from disk with no signal exactly as the grid does. The category
 * rail below does the same thing under the grid's per-category key
 * (STOURIFY-193), so picking "Nature" here shows exactly what picking "Nature"
 * on the grid would.
 *
 * **It names no map library.** Every affordance here — pins, controlled
 * selection, the peek card, recenter — belongs to `@/shared/map`, and
 * `__tests__/shared/map/vendorIsolation.test.ts` fails the build if this file
 * learns what is installed.
 *
 * **Its top overlay leaves `MapCanvas`'s own recenter button alone.** That
 * button floats at `top: insets.top + 12, right: 12`, about 44 points wide;
 * the back disc and search pill here stop well short of it rather than
 * covering it.
 */
export default function MapScreen({ navigation }: Props) {
  const theme = useTheme()
  const database = useDatabase()
  const insets = useSafeAreaInsets()

  // Held as one coordinate, seeded synchronously, so the map is mounted on the
  // very first frame and never waits behind a permission dialog.
  const [center, setCenter] = useState<MapCoordinate>(DEFAULT_MAP_CENTER)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>(ALL_FILTER)
  const category = filter === ALL_FILTER ? undefined : filter

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
    // The same cache entry Discover's rail uses for this category — deliberately,
    // so a chip pressed on one screen has already been paid for on the other.
    //
    // The arrow around the fetcher is not style. React Query calls a query
    // function with its own context object as the first argument, so passing
    // `fetchExploreSpots` bare would hand that object in as the category and
    // send it to the server as a filter (STOURIFY-193).
    queryKey: EXPLORE_SPOTS_QUERY_KEY(category),
    queryFn: () => fetchExploreSpots(category),
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
            <PeekCard
              title={selectedSpot.title}
              category={selectedSpot.categories?.[0]}
              address={selectedSpot.address}
              rating={ratingFor(selectedSpot)}
              imageUri={thumbFor(selectedSpot)}
              onPress={() => navigation.navigate('SpotDetail', { spotId: selectedSpot.uuid })}
            />
          ) : null
        }
      />

      <View
        style={[styles.overlay, { top: insets.top + theme.spacing[3] }]}
        pointerEvents="box-none"
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing[2],
            paddingHorizontal: theme.gutter,
            // Leaves `MapCanvas`'s own recenter button — 44 wide at `right: 12`
            // — a clear 12-point gap rather than running the search pill under it.
            paddingRight: theme.minTouchTarget + theme.spacing[3] * 2,
          }}
        >
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.card,
              ...theme.elevation.floating,
            }}
          >
            <Icon name="back" size={20} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <SearchField
              placeholder="Search spots near you…"
              onPress={() => navigation.navigate('Search')}
            />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginTop: theme.spacing[2] }}
          contentContainerStyle={{ paddingHorizontal: theme.gutter, gap: theme.spacing[2] }}
        >
          {FILTERS.map((label) => (
            <Chip
              key={label}
              label={label}
              selected={filter === label}
              onPress={() => setFilter(label)}
            />
          ))}
        </ScrollView>
      </View>

      <Pressable
        onPress={() => navigation.navigate('Nearby')}
        accessibilityRole="button"
        accessibilityLabel="List"
        style={{
          position: 'absolute',
          right: theme.gutter,
          bottom: LIST_BUTTON_CLEARANCE,
          width: theme.minTouchTarget,
          height: theme.minTouchTarget,
          borderRadius: theme.minTouchTarget / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.card,
          ...theme.elevation.floating,
        }}
      >
        <Icon name="list" size={20} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: { position: 'absolute', left: 0, right: 0 },
})
