import { useCallback, useState } from 'react'
import { FlatList, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Chip, EmptyState, SpotCard, Text } from '@/shared/components/ui'
import type { DiscoverStackParamList } from '@/shared/navigation/types'
import type { Spot } from '@/shared/api/types'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { useTheme } from '@/theme/ThemeProvider'
import { SPOT_CATEGORIES } from '@/shared/config/spotCategories'
import { EXPLORE_SPOTS_QUERY_KEY, fetchExploreSpots, thumbFor } from '../api/exploreSpots'

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
 * Discover's explore grid — the browse surface of the app.
 *
 * Two things about it are worth knowing before changing it.
 *
 * **Cells draw thumbnails.** `thumbFor()` owns that rule and explains why there
 * is no fallback to the original.
 *
 * **It reads whatever it has.** The grid renders `spots` whenever `spots` has
 * rows, and only reaches for an empty or an error state when it has nothing at
 * all. That single ordering is what makes the screen work in a dead spot: the
 * persisted React Query cache rehydrates yesterday's page at launch, a
 * background refetch fails silently, and the explorer keeps reading. An
 * `isError` check placed before the list would delete that behaviour, and never
 * once show it had, because online the branch is unreachable.
 */
export default function DiscoverScreen({ navigation }: Props) {
  const theme = useTheme()

  const [filter, setFilter] = useState<string>(ALL_FILTER)
  const category = filter === ALL_FILTER ? undefined : filter

  const { data, isPending, isError, refetch } = useQuery({
    // The category is part of the key, so each rail selection caches its own
    // page rather than overwriting the last one. It is also what the on-disk
    // cache files the answer under, which is what lets a chip you pressed
    // yesterday still have something to show in a dead spot.
    queryKey: EXPLORE_SPOTS_QUERY_KEY(category),
    queryFn: () => fetchExploreSpots(category),
  })

  // Same reason as NearbyScreen: this screen stays mounted, so a spot added
  // since you last looked would not appear until something else forced a
  // fetch (STOURIFY-200).
  useRefetchOnFocus(navigation, refetch)

  const spots = data ?? []

  const renderItem = useCallback(
    ({ item }: { item: Spot }) => (
      <View style={{ flex: 1 }}>
        <SpotCard
          title={item.title}
          category={item.categories?.[0]}
          imageUri={thumbFor(item)}
          rating={item.rating_average}
          reviewCount={item.reviews_count}
          meta={item.address}
          onPress={() => navigation.navigate('SpotDetail', { spotId: item.uuid })}
        />
      </View>
    ),
    [navigation],
  )

  const header = (
    <View style={{ gap: theme.spacing[4], paddingBottom: theme.spacing[4] }}>
      <Text variant="display">Discover</Text>

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

      <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
        <View style={{ flex: 1 }}>
          <Button
            label="Search spots"
            variant="secondary"
            onPress={() => navigation.navigate('Search')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="Spots near me"
            variant="secondary"
            onPress={() => navigation.navigate('Nearby')}
          />
        </View>
      </View>

      {/*
        The other way of reading the same spots. It is a row of its own rather
        than a third button beside the two above, because three labels of this
        length on a 360dp screen wrap to two lines each and the row stops
        looking like a row.
      */}
      <Button
        label="Explore on a map"
        variant="secondary"
        fullWidth
        onPress={() => navigation.navigate('Map')}
      />
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
      icon="📡"
      title="Can't reach Stourify"
      subtitle="No connection and nothing saved from last time. Try again once you have signal."
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
      <FlatList
        data={spots}
        keyExtractor={(item) => item.uuid}
        renderItem={renderItem}
        numColumns={2}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        columnWrapperStyle={{ gap: theme.spacing[3] }}
        contentContainerStyle={{ padding: theme.gutter, gap: theme.spacing[3] }}
      />
    </SafeAreaView>
  )
}
