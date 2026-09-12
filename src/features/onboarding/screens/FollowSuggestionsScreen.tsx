import { useCallback, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { FlatList, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { OnboardingStackParamList } from '@/shared/navigation/types'
import { searchPeople } from '@/shared/api/discover'
import { describeRequestFailure } from '@/shared/api/errorMessage'
import { follow } from '@/shared/api/follows'
import { Avatar, Button, EmptyState, SearchField, Text } from '@/shared/components/ui'
import FollowPill from '@/features/onboarding/components/FollowPill'
import OnboardingFrame from '@/features/onboarding/components/OnboardingFrame'
import { useOnboardingStore } from '@/shared/store/onboarding'
import { useDebounce } from '@/shared/hooks/useDebounce'
import type { Person } from '@/shared/api/types'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<OnboardingStackParamList, 'FollowSuggestions'>

/**
 * Artboard 4 of the Onboarding design (STOURIFY-287), kept search-first.
 *
 * There is no follow-suggestions endpoint. This is people search
 * (`GET /discover/search?type=people`) — it does not claim to be "suggested for
 * you"; a real recommendation surface needs a server-side query this milestone
 * does not build. So the design's ready-made list, its "Follow all" and its
 * "Trailblazer" / "Local Expert" labels are not drawn: there is nothing to fill
 * the list from, "Follow all" over search results would follow whoever matched
 * a typed name, and explorers have no ranks.
 *
 * The last onboarding step: finishing it — "Start exploring", or Skip, same as
 * any other route out — marks onboarding complete so it never replays.
 */
export default function FollowSuggestionsScreen({ navigation: _navigation }: Props) {
  const theme = useTheme()
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)
  const complete = useOnboardingStore((state) => state.complete)
  const [followedUuids, setFollowedUuids] = useState<string[]>([])

  const isSearchable = debouncedQuery.trim().length >= 2

  const { data, error, isFetching, isError, refetch } = useQuery({
    queryKey: ['discover-people', debouncedQuery],
    queryFn: () => searchPeople(debouncedQuery),
    enabled: isSearchable,
  })

  const people = data?.data ?? []

  /**
   * What the failure panel says under its headline, chosen from the failure
   * that actually happened (STOURIFY-249, following STOURIFY-225).
   *
   * This used to be one fixed sentence about the connection, shown for every
   * way a request can go wrong — including the one where the server picked up
   * and refused. The headline stays this screen's own, "Couldn't search for
   * people": a search is not a load, and the helper's `Couldn't load …` would
   * say the wrong verb. Only the icon and the explanation move.
   */
  const failure = describeRequestFailure(error, 'people')

  const followMutation = useMutation({
    mutationFn: (userUuid: string) => follow(userUuid),
    onSuccess: (_data, userUuid) => setFollowedUuids((prev) => [...prev, userUuid]),
  })

  const renderItem = useCallback(
    ({ item }: { item: Person }) => {
      const name = item.name ?? item.username

      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <Avatar name={name} size={52} />
          <View style={{ flex: 1 }}>
            <Text
              variant="body"
              numberOfLines={1}
              style={{ fontFamily: theme.fontFamily.bodySemiBold }}
            >
              {name}
            </Text>
            <Text variant="caption" color="muted" numberOfLines={1}>
              {item.bio ?? `@${item.username}`}
            </Text>
          </View>
          <FollowPill
            name={name}
            following={!item.user_uuid || followedUuids.includes(item.user_uuid)}
            onPress={() => followMutation.mutate(item.user_uuid!)}
            disabled={followMutation.isPending}
          />
        </View>
      )
    },
    [followMutation, followedUuids, theme],
  )

  /**
   * Only reached with no rows to show, and the four cases are genuinely
   * different situations with different remedies — so they get different words:
   * "we have not been asked yet", "we are still asking", "we could not ask",
   * and "we asked and there is nobody".
   *
   * Before STOURIFY-88 there were two branches and a failed request fell into
   * the one that says "No one found" — a claim about Stourify, made by a screen
   * that never found out, to somebody three minutes into their first session on
   * the one step built to prove the opposite. A reader told nobody matched
   * searches for a different name; a reader told the request failed tries the
   * same search again, which is the one move that helps.
   *
   * Three orderings here are load-bearing, and they are `SearchScreen`'s
   * (`SearchScreen.tsx:223-281`), which this screen's gated shape copies:
   *
   * **This lives inside `ListEmptyComponent`**, which renders only when the list
   * has no rows at all — so content always wins over an error. React Query keeps
   * serving the people it already holds while a later fetch fails, and the
   * reader keeps following them. Hoisting an `isError` check above the
   * `FlatList` would delete that, and never once show it had, because the branch
   * is unreachable while online. `FeedScreen`, `DiscoverScreen`, `NearbyScreen`
   * and `SearchScreen` carry the same warning.
   *
   * **`isSearchable` is asked first, and explicitly.** The query is switched off
   * below the server's two-character minimum, and with `enabled: false` React
   * Query v5 reports `isPending: true` and `isFetching: false` — so a query that
   * was never sent looks *settled*. Ask anything before the gate and this screen
   * reports an outcome for a search it never ran. "Nothing typed" and "one
   * character typed" share the prompt on purpose: the remedy is the same
   * sentence for both.
   *
   * **`isFetching` is asked before `isError`**, which differs from `FeedScreen`
   * and from the sibling `ReviewsScreen` (STOURIFY-85) and is deliberate. Those
   * ask `isLoading`, which is false during a retry, so their failure copy stays
   * up while it runs. Here a pressed **Try again** shows "Searching…" instead —
   * the acknowledgement of a button the reader just pressed, on a screen where
   * every keystroke past two characters starts another request. Either way the
   * property that matters holds: "No one found" never appears during a failed
   * search or its retry.
   */
  const empty = !isSearchable ? (
    <EmptyState
      icon="🔍"
      title="Search for people"
      subtitle="Type at least two characters to find someone to follow."
    />
  ) : isFetching ? (
    <EmptyState icon="⏳" title="Searching…" subtitle={`Looking for "${debouncedQuery}"`} />
  ) : isError ? (
    <EmptyState
      icon={failure.icon}
      title="Couldn't search for people"
      subtitle={failure.subtitle}
      actionLabel="Try again"
      onAction={() => void refetch()}
    />
  ) : (
    <EmptyState icon="🔍" title="No one found" subtitle="Try a different name or handle" />
  )

  const finish = () => void complete()

  return (
    <OnboardingFrame
      step={4}
      onSkip={finish}
      title="Follow explorers"
      subtitle="Search for people you know to warm up your feed."
      footer={<Button label="Start exploring" size="lg" onPress={finish} fullWidth />}
    >
      <SearchField placeholder="Search people" value={query} onChangeText={setQuery} />

      <FlatList
        data={people}
        keyExtractor={(item) => item.uuid}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        style={{ marginTop: theme.spacing[5] }}
        contentContainerStyle={people.length === 0 ? { flex: 1 } : undefined}
        ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
        ListEmptyComponent={empty}
      />
    </OnboardingFrame>
  )
}
