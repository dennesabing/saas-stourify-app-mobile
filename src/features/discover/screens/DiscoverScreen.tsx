import { useCallback } from 'react'
import { FlatList, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Chip, EmptyState, SpotCard, Text } from '@/shared/components/ui'
import type { DiscoverStackParamList } from '@/shared/navigation/types'
import type { Spot } from '@/shared/api/types'
import { useTheme } from '@/theme/ThemeProvider'
import { EXPLORE_SPOTS_QUERY_KEY, fetchExploreSpots, thumbFor } from '../api/exploreSpots'

type Props = NativeStackScreenProps<DiscoverStackParamList, 'Discover'>

/**
 * Decorative, and deliberately still decorative.
 *
 * Making a chip filter needs a category rule on the server that
 * `SpotIndexRequest` does not have — Laravel drops query parameters it has not
 * validated without complaining, so a wired-up chip would look like it worked
 * and return the unfiltered list every time. See `src/shared/api/spots.ts`,
 * which documents the same trap for the search parameter.
 */
const FILTERS = ['Trending', 'Nature', 'Foodie', 'Coast', 'Heritage']

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

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: EXPLORE_SPOTS_QUERY_KEY,
    queryFn: fetchExploreSpots,
  })

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

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
          {FILTERS.map((filter, index) => (
            <Chip key={filter} label={filter} selected={index === 0} />
          ))}
        </View>
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
        <View style={{ flex: 1 }}>
          <Button label="Search spots" variant="secondary" onPress={() => navigation.navigate('Search')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Spots near me" variant="secondary" onPress={() => navigation.navigate('Nearby')} />
        </View>
      </View>
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
