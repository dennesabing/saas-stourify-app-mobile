import { useCallback } from 'react'
import { AccessibilityInfo, FlatList } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import { describeRequestFailure } from '@/shared/api/errorMessage'
import SavedSpotRow from '@/features/spots/components/SavedSpotRow'
import SavedSpotsNotice from '@/features/spots/components/SavedSpotsNotice'
import { useSavedSpots, type SavedSpot } from '@/features/spots/hooks/useSavedSpots'
import { useUnsaveSpot } from '@/features/spots/hooks/useUnsaveSpot'
import { BarHeader, EmptyState } from '@/shared/components/ui'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
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
 * people's spots, and the offline sync only brings down your own. The saves
 * this phone has not sent yet are laid on top (STOURIFY-207) — until they
 * were, a spot saved a minute ago was missing here while the spot page showed
 * it saved. `useSavedSpots` does both.
 */
export default function SavedSpotsScreen({ navigation }: Props) {
  const theme = useTheme()

  const { items, rest, error, isPending, isError, refetch, isRefetching } = useSavedSpots()

  /**
   * What the failure panel says, chosen from the failure that actually
   * happened (STOURIFY-280, following STOURIFY-225 and -250).
   *
   * It used to read "Can't reach Stourify" over "…Your saves are safe — try
   * again once you have signal" for every failure, including a refusal the
   * server answered. As on Discover, the headline was part of the wrong claim,
   * so all three fields come from the helper. "Your saves are safe" was dropped
   * rather than kept as a suffix: after a 404 it would contradict the helper's
   * "It may have been removed", and the headline already says the loading
   * failed, not the saves. The decision is recorded on STOURIFY-280.
   */
  const failure = describeRequestFailure(error, 'your saved spots')

  // A save made on the spot page has to appear here when you come back, and
  // this screen stays mounted between visits (STOURIFY-200).
  useRefetchOnFocus(navigation, refetch)

  /**
   * Artboard 3's filled bookmark at the end of each row (STOURIFY-303). The
   * row goes at once; the server hears on the next sync. There is no toast in
   * this app to say so, so a screen reader is told instead, and a sighted
   * reader sees the row leave.
   */
  const unsave = useUnsaveSpot()
  const onRemove = useCallback(
    (item: SavedSpot) => {
      void unsave({ saveUuid: item.key, spotUuid: item.spot?.uuid ?? null })
      AccessibilityInfo.announceForAccessibility(
        `Removed ${item.spot?.title ?? 'the spot'} from your wishlist`,
      )
    },
    [unsave],
  )

  // The row is shared with the Wishlist tab on your own profile (STOURIFY-288).
  // Only this screen passes `onRemove`: artboard 1 draws the tab without one.
  const renderItem = useCallback(
    ({ item }: { item: SavedSpot }) => (
      <SavedSpotRow
        item={item}
        onOpenSpot={(spotId) => navigation.navigate('SpotDetail', { spotId })}
        onRemove={() => onRemove(item)}
      />
    ),
    [navigation, onRemove],
  )

  /**
   * Only reached with nothing to show — no save from the server and none
   * waiting on the phone. The three cases are different situations with
   * different remedies, so they get different words — the same rule
   * `DiscoverScreen` and `SearchScreen` follow, and for the same reason: a
   * reader told "you have saved nothing" when the request actually failed goes
   * away believing their saves were lost.
   */
  const empty = isPending ? (
    <EmptyState icon="🔖" title="Loading your saved spots…" />
  ) : isError ? (
    <EmptyState
      icon={failure.icon}
      title={failure.title}
      subtitle={failure.subtitle}
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
      {/* Artboard 3's back bar (STOURIFY-289). The canvas's map button at the
          right end is not drawn: saves carry no map view to switch to. */}
      <BarHeader title="Wishlist" onBack={() => navigation.goBack()} />

      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        onRefresh={() => void refetch()}
        refreshing={isRefetching}
        ListHeaderComponent={<SavedSpotsNotice rest={rest} onRetry={() => void refetch()} />}
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
