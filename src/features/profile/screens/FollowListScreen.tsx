import { useCallback, useMemo, useState } from 'react'
import { FlatList, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { isAxiosError } from 'axios'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import { getFollowers, getFollowing } from '@/shared/api/follows'
import { getMyProfile, getProfile } from '@/shared/api/profiles'
import { describeRequestFailure } from '@/shared/api/errorMessage'
import type { Follow, FollowExplorer } from '@/shared/api/types'
import { useAuthStore } from '@/shared/store/auth'
import {
  Avatar,
  BarHeader,
  EmptyState,
  SearchField,
  SegmentedControl,
  Text,
} from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<ProfileStackParamList, 'FollowList'>

type Side = 'followers' | 'following'

/** The canvas's `.urow .av`. */
const AVATAR_SIZE = 48

/**
 * Followers and Following on one screen — artboard 5 of the Profile design
 * (STOURIFY-289).
 *
 * It used to be two entries into one hard-coded dark screen that ignored the
 * theme: six colour literals, a text "← Back", and nothing at all to say when
 * the list failed to load or was private. Now a switch flips between the two
 * lists without a trip back to the profile, like the two halves of an address
 * book, and every colour comes from the theme.
 *
 * **The name and the counts come from the profile you came from.** The query
 * below uses the same key and the same request as `ProfileScreen`, so arriving
 * from a profile is answered from the cache and costs nothing. Counting the
 * rows instead would mean fetching both lists just to label the switch.
 *
 * **Search filters what is already loaded**, on the phone. It is instant and
 * it works offline; a server search is worth adding only once a list outgrows
 * its first page.
 *
 * **Not drawn, on purpose:** the canvas's Follow / Following pill on each row
 * (a follow row does not say whether YOU follow that person, and asking once
 * per row is the N+1 pattern STOURIFY-260 rejected), and labels like
 * "Trailblazer" (there are no explorer ranks).
 */
export default function FollowListScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const { userId } = route.params
  const { user: currentUser } = useAuthStore()
  const isOwn = userId === currentUser?.uuid

  const [side, setSide] = useState<Side>(route.params.type)
  const [search, setSearch] = useState('')

  const { data: profile } = useQuery({
    queryKey: ['explorer-profile', isOwn ? 'me' : userId],
    queryFn: () => (isOwn ? getMyProfile() : getProfile(userId)),
  })

  const listQuery = useQuery({
    queryKey: ['follow-list', side, userId],
    queryFn: () => (side === 'followers' ? getFollowers(userId) : getFollowing(userId)),
  })

  const people = useMemo(
    () =>
      (listQuery.data?.data ?? [])
        .map((edge: Follow) => (side === 'followers' ? edge.follower : edge.followee))
        .filter((person): person is FollowExplorer => !!person),
    [listQuery.data, side],
  )

  const needle = search.trim().replace(/^@/, '').toLowerCase()
  const shown = needle === '' ? people : people.filter((person) => matches(person, needle))

  const counts = profile?.counts
  const title = profile?.name ?? (isOwn ? currentUser?.name : undefined) ?? ''

  const renderPerson = useCallback(
    ({ item }: { item: FollowExplorer }) => (
      <Pressable
        onPress={() => navigation.navigate('Profile', { userId: item.uuid })}
        accessibilityRole="button"
        accessibilityLabel={item.name}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[3],
          paddingHorizontal: theme.gutter,
          paddingVertical: 9,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Avatar uri={item.avatar} name={item.name} size={AVATAR_SIZE} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            variant="body"
            numberOfLines={1}
            style={{ fontFamily: theme.fontFamily.bodySemiBold }}
          >
            {item.name}
          </Text>
          {item.username ? (
            <Text variant="caption" color="muted" numberOfLines={1}>
              @{item.username}
            </Text>
          ) : null}
        </View>
      </Pressable>
    ),
    [navigation, theme.fontFamily.bodySemiBold, theme.gutter, theme.spacing],
  )

  const empty = listQuery.isPending ? (
    <EmptyState icon="👥" title="Loading…" />
  ) : listQuery.isError ? (
    failurePanel(listQuery.error, side, () => void listQuery.refetch())
  ) : people.length > 0 ? (
    // Loaded, but the search matched nobody.
    <EmptyState icon="🔍" title={`No explorers match "${search.trim()}"`} />
  ) : (
    <EmptyState
      icon="👥"
      title={side === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
    />
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <BarHeader title={title} onBack={() => navigation.goBack()} />

      <View
        style={{
          paddingHorizontal: theme.gutter,
          paddingTop: theme.spacing[2],
          paddingBottom: theme.spacing[3],
          gap: theme.spacing[3],
        }}
      >
        <SegmentedControl<Side>
          testID="follow-list-switch"
          value={side}
          onChange={setSide}
          options={[
            { key: 'followers', label: sideLabel(counts?.followers, 'Follower', 'Followers') },
            { key: 'following', label: sideLabel(counts?.following, 'Following', 'Following') },
          ]}
        />

        <SearchField
          testID="follow-list-search"
          placeholder="Search explorers"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={shown}
        keyExtractor={(person) => person.uuid}
        renderItem={renderPerson}
        ListEmptyComponent={empty}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={
          shown.length === 0 ? { flexGrow: 1 } : { paddingBottom: theme.spacing[6] }
        }
      />
    </SafeAreaView>
  )
}

/** "3,204 Followers", or just "Followers" until the profile has answered. */
function sideLabel(count: number | undefined, singular: string, plural: string): string {
  if (count === undefined) return plural
  return `${count.toLocaleString('en-US')} ${count === 1 ? singular : plural}`
}

function matches(person: FollowExplorer, needle: string): boolean {
  return (
    person.name.toLowerCase().includes(needle) ||
    (person.username ?? '').toLowerCase().includes(needle)
  )
}

/**
 * Why the list is not showing.
 *
 * A 403 is a privacy answer, not a failure (`shared/api/follows.ts`): a
 * private account's lists are visible only to the account and its approved
 * followers. Reporting it as "couldn't load" would invite a retry that can
 * never succeed, and an empty list would claim they have no followers.
 */
function failurePanel(error: unknown, side: Side, retry: () => void) {
  if (isAxiosError(error) && error.response?.status === 403) {
    return (
      <EmptyState
        icon="🔒"
        title="This list is private"
        subtitle="Only people this explorer has approved can see who follows them and who they follow."
      />
    )
  }

  const failure = describeRequestFailure(
    error,
    side === 'followers' ? 'followers' : 'the following list',
  )

  return (
    <EmptyState
      icon={failure.icon}
      title={failure.title}
      subtitle={failure.subtitle}
      actionLabel="Try again"
      onAction={retry}
    />
  )
}
