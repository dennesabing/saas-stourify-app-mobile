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

  const { data, isFetching } = useQuery({
    queryKey: ['discover-people', debouncedQuery],
    queryFn: () => searchPeople(debouncedQuery),
    enabled: debouncedQuery.trim().length >= 2,
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top', 'bottom']}>
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
        ListEmptyComponent={
          !isFetching && debouncedQuery.trim().length >= 2
            ? () => <EmptyState icon="🔍" title="No one found" subtitle="Try a different name or handle" />
            : null
        }
      />

      <View style={{ padding: theme.gutter }}>
        <Button label="Skip" variant="ghost" onPress={() => void complete()} fullWidth />
      </View>
    </SafeAreaView>
  )
}
