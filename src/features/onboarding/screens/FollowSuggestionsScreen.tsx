import { useCallback, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { FlatList, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { OnboardingStackParamList } from '@/shared/navigation/types'
import { searchPeople } from '@/shared/api/discover'
import { follow } from '@/shared/api/follows'
import { Avatar, Button, Card, EmptyState, Input, Text } from '@/shared/components/ui'
import { useOnboardingStore } from '@/shared/store/onboarding'
import { useDebounce } from '@/shared/hooks/useDebounce'
import type { Person } from '@/shared/api/types'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<OnboardingStackParamList, 'FollowSuggestions'>

/**
 * There is no follow-suggestions endpoint. This is people search
 * (`GET /discover/search?type=people`) with a prominent Skip — it does not
 * claim to be "suggested for you"; a real recommendation surface needs a
 * server-side query this milestone does not build.
 *
 * The last onboarding step: finishing it (Skip, same as any other route out)
 * marks onboarding complete so it never replays.
 *
 * `edges` names `bottom` as well as `top`, so the Skip footer stays clear of
 * the phone's own navigation bar. `InterestsScreen` explains why onboarding
 * needs that and the rest of the app does not (STOURIFY-81).
 */
export default function FollowSuggestionsScreen({ navigation: _navigation }: Props) {
  const theme = useTheme()
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)
  const complete = useOnboardingStore((state) => state.complete)
  const [followedUuids, setFollowedUuids] = useState<string[]>([])

  const isSearchable = debouncedQuery.trim().length >= 2

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['discover-people', debouncedQuery],
    queryFn: () => searchPeople(debouncedQuery),
    enabled: isSearchable,
  })

  const people = data?.data ?? []

  const followMutation = useMutation({
    mutationFn: (userUuid: string) => follow(userUuid),
    onSuccess: (_data, userUuid) => setFollowedUuids((prev) => [...prev, userUuid]),
  })

  const renderItem = useCallback(
    ({ item }: { item: Person }) => (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}>
          <Avatar name={item.name ?? item.username} />
          <View style={{ flex: 1 }}>
            <Text variant="body">{item.name ?? item.username}</Text>
            <Text variant="caption" color="muted">
              @{item.username}
            </Text>
          </View>
          {item.user_uuid && !followedUuids.includes(item.user_uuid) ? (
            <Button
              label="Follow"
              variant="secondary"
              onPress={() => followMutation.mutate(item.user_uuid!)}
              disabled={followMutation.isPending}
            />
          ) : (
            <Text variant="caption" color="primary">
              Following
            </Text>
          )}
        </View>
      </Card>
    ),
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
      icon="📡"
      title="Couldn't search for people"
      subtitle="We couldn't reach Stourify just now. Check your connection and try the same search again."
      actionLabel="Try again"
      onAction={() => void refetch()}
    />
  ) : (
    <EmptyState icon="🔍" title="No one found" subtitle="Try a different name or handle" />
  )

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.surface }}
      edges={['top', 'bottom']}
    >
      <View style={{ padding: theme.gutter, gap: theme.spacing[3] }}>
        <Text variant="h1">Find people to follow</Text>
        <Input placeholder="Search people" value={query} onChangeText={setQuery} />
      </View>

      <FlatList
        data={people}
        keyExtractor={(item) => item.uuid}
        renderItem={renderItem}
        contentContainerStyle={
          people.length === 0
            ? { flex: 1 }
            : { paddingHorizontal: theme.gutter, gap: theme.spacing[3] }
        }
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing[3] }} />}
        ListEmptyComponent={empty}
      />

      <View style={{ padding: theme.gutter }}>
        <Button label="Skip" variant="ghost" onPress={() => void complete()} fullWidth />
      </View>
    </SafeAreaView>
  )
}
