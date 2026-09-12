import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Chip, EmptyState, Icon, SearchField, Text } from '@/shared/components/ui'
import type { DiscoverStackParamList } from '@/shared/navigation/types'
import { describeRequestFailure } from '@/shared/api/errorMessage'
import type { Spot } from '@/shared/api/types'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { useTheme } from '@/theme/ThemeProvider'
import { SPOT_CATEGORIES } from '@/shared/config/spotCategories'
import {
  EXPLORE_SPOTS_QUERY_KEY,
  fetchExploreSpots,
  ratingFor,
  thumbFor,
} from '../api/exploreSpots'
import MosaicTile from '../components/MosaicTile'

type Props = NativeStackScreenProps<DiscoverStackParamList, 'Discover'>

/**
 * The filter rail, and it now actually filters (STOURIFY-193).
 *
 * It was decorative for a real reason, recorded here before: making a chip
 * filter needed a category rule on the server that `SpotIndexRequest` did not
 * have, and Laravel drops a query parameter it has not validated without
 * complaining — so a wired-up chip would have looked like it worked and
 * returned the unfiltered list every single time. Leaving them inert was the
 * right call over shipping something that lies.
 *
 * That rule exists now, so the wiring is honest.
 *
 * Two things changed besides the wiring. The labels come from the shared
 * vocabulary rather than a list written out here, so the rail can only ever
 * offer what the Create screen actually writes. And `Trending` is gone: it was
 * never a category, nothing was ever tagged with it, and there is no
 * trending signal on the server for it to mean. `All` took its place, which is
 * what it was really doing — it was the selected chip and the list was
 * unfiltered.
 */
const ALL_FILTER = 'All'
const FILTERS = [ALL_FILTER, ...SPOT_CATEGORIES]

/**
 * The two alternating tile heights the mosaic uses, and the offset each
 * column starts at, per the design (STOURIFY-259, artboard 1). The right
 * column starts on the short tile so the two columns step past each other
 * rather than lining up into an ordinary two-column grid.
 */
const TILE_HEIGHTS: [number, number] = [170, 120]

function tileHeight(columnIndex: number, positionInColumn: number): number {
  const parity = positionInColumn % 2 === 0 ? 0 : 1
  return columnIndex === 0 ? TILE_HEIGHTS[parity] : TILE_HEIGHTS[1 - parity]
}

/**
 * Discover's explore grid — the browse surface of the app.
 *
 * Three things about it are worth knowing before changing it.
 *
 * **Cells draw thumbnails.** `thumbFor()` owns that rule and explains why there
 * is no fallback to the original.
 *
 * **It reads whatever it has.** The mosaic renders `spots` whenever `spots` has
 * rows, and only reaches for an empty or an error state when it has nothing at
 * all. That single ordering is what makes the screen work in a dead spot: the
 * persisted React Query cache rehydrates yesterday's page at launch, a
 * background refetch fails silently, and the explorer keeps reading. An
 * `isError` check placed before the list would delete that behaviour, and never
 * once show it had, because online the branch is unreachable.
 *
 * **It honours `route.params.category`.** Search's category tiles navigate
 * here with one, so the chip they meant is already selected rather than
 * landing on an unfiltered grid the explorer has to re-filter by hand — and it
 * keeps responding if that param changes again while this screen stays
 * mounted, since React Navigation reuses the screen instance rather than
 * remounting it.
 */
export default function DiscoverScreen({ navigation, route }: Props) {
  const theme = useTheme()

  const [filter, setFilter] = useState<string>(ALL_FILTER)
  const category = filter === ALL_FILTER ? undefined : filter

  useEffect(() => {
    if (route.params?.category) setFilter(route.params.category)
  }, [route.params?.category])

  const { data, error, isPending, isError, refetch } = useQuery({
    // The category is part of the key, so each rail selection caches its own
    // page rather than overwriting the last one. It is also what the on-disk
    // cache files the answer under, which is what lets a chip you pressed
    // yesterday still have something to show in a dead spot.
    queryKey: EXPLORE_SPOTS_QUERY_KEY(category),
    queryFn: () => fetchExploreSpots(category),
  })

  /**
   * What the failure panel says, chosen from the failure that actually
   * happened (STOURIFY-250, following STOURIFY-225).
   *
   * It used to read "Can't reach Stourify" over "No connection and nothing
   * saved from last time" for every failure, including a refusal the server
   * answered — so here the headline was part of the lie, and all three fields
   * come from the helper. The "nothing saved" half was dropped rather than
   * glued on as a suffix: the panel only appears when nothing was saved (see
   * the ordering note on this component), and after a refusal it would imply a
   * saved copy could have helped. The decision is recorded on STOURIFY-250.
   */
  const failure = describeRequestFailure(
    error,
    category ? `${category.toLowerCase()} spots` : 'spots to explore',
  )

  // Same reason as NearbyScreen: this screen stays mounted, so a spot added
  // since you last looked would not appear until something else forced a
  // fetch (STOURIFY-200).
  useRefetchOnFocus(navigation, refetch)

  const spots = data ?? []

  // Two columns, in order — even-indexed spots left, odd-indexed right — so
  // the staggered heights below step past each other down the screen instead
  // of lining up into an ordinary grid.
  const leftColumn: Spot[] = []
  const rightColumn: Spot[] = []
  spots.forEach((spot, index) => (index % 2 === 0 ? leftColumn : rightColumn).push(spot))

  const renderTile = useCallback(
    (spot: Spot, columnIndex: number, positionInColumn: number) => (
      <MosaicTile
        key={spot.uuid}
        title={spot.title}
        category={spot.categories?.[0]}
        rating={ratingFor(spot)}
        imageUri={thumbFor(spot)}
        height={tileHeight(columnIndex, positionInColumn)}
        onPress={() => navigation.navigate('SpotDetail', { spotId: spot.uuid })}
      />
    ),
    [navigation],
  )

  const sectionLabel = category ? `${category} spots` : 'Spots to explore'

  const header = (
    <View style={{ gap: theme.spacing[4], paddingBottom: theme.spacing[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="h1">Discover</Text>

        {/* Replaces the design's "For You" — there is no feed behind it yet,
            and "Near me" is a real entry point Nearby already answers. */}
        <Pressable
          onPress={() => navigation.navigate('Nearby')}
          accessibilityRole="button"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing[1],
            minHeight: theme.minTouchTarget,
            paddingHorizontal: theme.spacing[1],
          }}
        >
          <Icon name="locate" size={15} color="primary" />
          <Text variant="caption" color="primary" style={{ fontFamily: theme.fontFamily.bodyBold }}>
            Near me
          </Text>
        </Pressable>
      </View>

      <SearchField
        placeholder="Search spots, cities, people…"
        onPress={() => navigation.navigate('Search')}
      />

      {/* `flexGrow: 0` is load-bearing. A horizontal ScrollView with no height
          constraint stretches to fill whatever space is left below it, so the
          chips render as full-height pills down the screen — obvious on a device
          and invisible to every test, which asserts on text and not on layout.
          `SearchScreen` carries the same note and the same fix. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
          {FILTERS.map((label) => (
            <Chip
              key={label}
              label={label}
              selected={filter === label}
              onPress={() => setFilter(label)}
            />
          ))}
        </View>
      </ScrollView>

      {/* `micro` is already uppercase by style; the string itself stays mixed
          case so `getByText` (and a screen reader) sees the real words. */}
      <Text variant="micro" color="muted">
        {sectionLabel}
      </Text>
    </View>
  )

  /**
   * Only reached with no rows to show. The three cases are genuinely different
   * situations with different remedies, so they get different words — "we are
   * still looking", "we could not ask", and "we asked and there is nothing".
   */
  const empty = isPending ? (
    <EmptyState icon="🧭" title="Finding spots…" subtitle="Loading places to explore." />
  ) : isError ? (
    <EmptyState
      icon={failure.icon}
      title={failure.title}
      subtitle={failure.subtitle}
      actionLabel="Try again"
      onAction={() => void refetch()}
    />
  ) : category ? (
    // Nothing in THIS category is a different fact from nothing at all, and
    // telling somebody to go and add the first spot — when there are plenty,
    // just none tagged Nightlife — sends them off to solve a problem they do
    // not have.
    <EmptyState
      icon="🗺️"
      title={`No ${category.toLowerCase()} spots yet`}
      subtitle="Try another category, or be the first to add one here."
    />
  ) : (
    <EmptyState
      icon="🗺️"
      title="Nothing to explore yet"
      subtitle="Be the first to add a spot and it will show up here."
    />
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.gutter, flexGrow: 1 }}>
        {header}
        {spots.length > 0 ? (
          <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
            <View style={{ flex: 1, gap: theme.spacing[2] }}>
              {leftColumn.map((spot, position) => renderTile(spot, 0, position))}
            </View>
            <View style={{ flex: 1, gap: theme.spacing[2] }}>
              {rightColumn.map((spot, position) => renderTile(spot, 1, position))}
            </View>
          </View>
        ) : (
          <View style={{ flex: 1 }}>{empty}</View>
        )}
      </ScrollView>

      {/* Floats over the mosaic rather than sitting in the flow, per the
          design's FAB — it is always reachable without scrolling to a button
          at the bottom of a long list. */}
      <Pressable
        onPress={() => navigation.navigate('Map')}
        accessibilityRole="button"
        accessibilityLabel="Map"
        style={{
          position: 'absolute',
          right: theme.gutter,
          bottom: theme.spacing[6],
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[1],
          backgroundColor: theme.colors.button,
          borderRadius: 26,
          paddingVertical: theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
          ...theme.elevation.floating,
        }}
      >
        <Icon name="map" size={17} color="onButton" />
        <Text variant="caption" color="onButton" style={{ fontFamily: theme.fontFamily.bodyBold }}>
          Map
        </Text>
      </Pressable>
    </SafeAreaView>
  )
}
