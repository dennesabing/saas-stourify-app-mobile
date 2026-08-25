import { useCallback } from 'react'
import { FlatList, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import { WISHLIST_QUERY_KEY, getWishlist, type WishlistItem } from '@/shared/api/wishlist'
import { thumbFor } from '@/features/discover/api/exploreSpots'
import { EmptyState, SpotCard, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<ProfileStackParamList, 'Wishlist'>

/**
 * The spots this explorer has saved.
 *
 * **This screen did not exist until STOURIFY-195, and nothing linked to it.**
 * The route name was declared in the navigator's list of screens and no screen
 * was ever registered under it — a door frame with no door and no room behind
 * it. Saving a spot worked, wrote a row, and sent it to the server correctly;
 * there was simply nowhere in the app to go and look at the result. The heart
 * on a spot was a promise the app had no way of keeping.
 *
 * It reads the server's list rather than the local one, and
 * `shared/api/wishlist.ts` explains why at length: saves are mostly of other
 * people's spots, and the offline sync only brings down your own.
 */
export default function SavedSpotsScreen({ navigation }: Props) {
  const theme = useTheme()

  const { data, isPending, isError, refetch, isRefetching } = useQuery({
    queryKey: WISHLIST_QUERY_KEY,
    queryFn: getWishlist,
  })

  const items = data ?? []

  const renderItem = useCallback(
    ({ item }: { item: WishlistItem }) => {
      const { spot } = item

      // A saved row whose spot is gone. Rendering nothing would silently shorten
      // the list, so it says what happened instead — the alternative is an
      // explorer counting their saves and finding one missing with no reason.
      if (!spot) {
        return (
          <View
            testID="saved-spot-missing"
            style={{
              padding: theme.spacing[3],
              backgroundColor: theme.colors.surfaceAlt,
              borderRadius: theme.radius.card,
            }}
          >
            <Text variant="body" color="muted">
              This spot is no longer available.
            </Text>
          </View>
        )
      }

      return (
        <SpotCard
          title={spot.title}
          layout="wide"
          category={spot.categories?.[0]}
          imageUri={thumbFor(spot)}
          rating={spot.rating_average}
          reviewCount={spot.reviews_count}
          meta={spot.address}
          onPress={() => navigation.navigate('SpotDetail', { spotId: spot.uuid })}
        />
      )
    },
    [navigation, theme],
  )

  /**
   * Only reached with nothing to show. The three cases are different situations
   * with different remedies, so they get different words — the same rule
   * `DiscoverScreen` and `SearchScreen` follow, and for the same reason: a
   * reader told "you have saved nothing" when the request actually failed goes
   * away believing their saves were lost.
   */
  const empty = isPending ? (
    <EmptyState icon="🔖" title="Loading your saved spots…" />
  ) : isError ? (
    <EmptyState
      icon="📡"
      title="Can't reach Stourify"
      subtitle="We couldn't load your saved spots just now. Your saves are safe — try again once you have signal."
      actionLabel="Try again"
      onAction={() => void refetch()}
    />
  ) : (
    <EmptyState
      icon="🔖"
      title="Nothing saved yet"
      subtitle="Tap the heart on any spot and it will show up here."
    />
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <View style={{ padding: theme.gutter }}>
        <Text variant="h1">Saved</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.uuid}
        renderItem={renderItem}
        onRefresh={() => void refetch()}
        refreshing={isRefetching}
        ListEmptyComponent={empty}
        contentContainerStyle={
          items.length === 0
            ? { flex: 1 }
            : { paddingHorizontal: theme.gutter, gap: theme.spacing[3] }
        }
      />
    </SafeAreaView>
  )
}
