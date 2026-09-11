import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FlatList, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { CompositeScreenProps } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ActivityStackParamList, TabParamList } from '@/shared/navigation/types'
import { acceptFollowRequest, declineFollowRequest, getFollowRequests } from '@/shared/api/follows'
import { Avatar, BarHeader, EmptyState, Icon, Skeleton, Text } from '@/shared/components/ui'
import type { Follow, PaginatedResponse } from '@/shared/api/types'
import { shortRelativeTime } from '@/shared/utils/relativeTime'
import { recencyGroup, type RecencyGroup } from '@/features/activity/recencyGroup'
import { useTheme } from '@/theme/ThemeProvider'

type Props = CompositeScreenProps<
  NativeStackScreenProps<ActivityStackParamList, 'Activity'>,
  BottomTabScreenProps<TabParamList>
>

const FOLLOW_REQUESTS_QUERY_KEY = ['follow-requests'] as const

/** The artboard's `.nrow .av` and its `.type` badge. */
const AVATAR_SIZE = 44
const BADGE_SIZE = 20

/** The artboard's `.fb` pill: 12-point text inside 7 points of padding. */
const PILL_HEIGHT = 30

/** A row is either a group's label or one request under it. */
type Row =
  | { kind: 'group'; key: string; label: RecencyGroup }
  | { kind: 'request'; key: string; follow: Follow }

/**
 * Newest first, with a label before the first request of each period. Sorted
 * here rather than trusted from the server so a label can never appear twice:
 * the grouping only holds if the periods arrive in order.
 */
function buildRows(requests: Follow[], now: number): Row[] {
  const sorted = [...requests].sort(
    (a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0),
  )

  const rows: Row[] = []
  let current: RecencyGroup | null = null

  for (const follow of sorted) {
    const group = recencyGroup(Date.parse(follow.created_at), now)
    if (group !== current) {
      rows.push({ kind: 'group', key: `group-${group}`, label: group })
      current = group
    }
    rows.push({ kind: 'request', key: follow.uuid, follow })
  }

  return rows
}

/**
 * Activity as the follow-request inbox, drawn as artboard 6 of
 * `docs/design/Stourify - Home Feed.dc.html` (STOURIFY-262).
 *
 * There is no notifications/activity API anywhere in the module or the
 * boilerplate — no endpoint, no table. `GET /api/v1/follows/requests` is what
 * genuinely exists and is actionable, so this screen ships as that inbox
 * rather than a fake feed. See the M3b plan's scope decisions.
 *
 * The artboard draws more than that data can fill. Like and comment rows (and
 * their heart and bubble badges), the spot thumbnail, the unread wash, badge
 * and challenge rows, and "Follow back" are deliberately absent; the card
 * lists why for each. A request row takes the artboard's follow row, with
 * Accept and Decline where it draws its one pill.
 */
export default function ActivityScreen({ navigation }: Props) {
  const theme = useTheme()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: FOLLOW_REQUESTS_QUERY_KEY,
    queryFn: getFollowRequests,
  })

  const requests = useMemo(() => data?.data ?? [], [data])
  const rows = useMemo(() => buildRows(requests, Date.now()), [requests])

  const removeRow = useCallback(
    (followUuid: string) => {
      queryClient.setQueryData<PaginatedResponse<Follow>>(FOLLOW_REQUESTS_QUERY_KEY, (old) =>
        old ? { ...old, data: old.data.filter((f) => f.uuid !== followUuid) } : old,
      )
    },
    [queryClient],
  )

  const acceptMutation = useMutation({
    mutationFn: (followUuid: string) => acceptFollowRequest(followUuid),
    onSuccess: (_data, followUuid) => removeRow(followUuid),
  })

  const declineMutation = useMutation({
    mutationFn: (followUuid: string) => declineFollowRequest(followUuid),
    onSuccess: (_data, followUuid) => removeRow(followUuid),
  })

  const busy = acceptMutation.isPending || declineMutation.isPending

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'group') {
        return (
          <Text
            testID={`activity-group-${item.label}`}
            variant="micro"
            color="muted"
            style={{
              fontFamily: theme.fontFamily.bodyBold,
              letterSpacing: 0.8,
              paddingHorizontal: theme.gutter,
              paddingTop: 14,
              paddingBottom: 6,
            }}
          >
            {item.label}
          </Text>
        )
      }

      const follower = item.follow.follower
      const time = shortRelativeTime(Date.parse(item.follow.created_at), Date.now())

      return (
        <View
          testID={`activity-row-${item.follow.uuid}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 9,
            paddingHorizontal: theme.gutter,
          }}
        >
          <View>
            <Avatar name={follower?.name} uri={follower?.avatar} size={AVATAR_SIZE} />
            {/* The artboard's typed badge. A request is a follow, so it is
                always the azure "+"; the heart and bubble belong to like and
                comment rows, which have no data behind them. */}
            <View
              style={{
                position: 'absolute',
                right: -2,
                bottom: -2,
                width: BADGE_SIZE,
                height: BADGE_SIZE,
                borderRadius: BADGE_SIZE / 2,
                borderWidth: 2,
                borderColor: theme.colors.surface,
                backgroundColor: theme.colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="add" size={11} color="onButton" strokeWidth={3} />
            </View>
          </View>

          {/* One sentence that wraps, as the design sets it: the name, what
              they did, and a muted time. It fills the row with `flex: 1`
              rather than shrink-wrapping, which is what keeps Android from
              measuring the semibold name short (see `PostCard`). */}
          <Text variant="body" style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>
            <Text
              variant="body"
              style={{ fontSize: 13, lineHeight: 18, fontFamily: theme.fontFamily.bodySemiBold }}
              onPress={
                follower?.uuid
                  ? () => navigation.navigate('Profile', { userId: follower.uuid })
                  : undefined
              }
            >
              {follower?.name ?? 'Someone'}
            </Text>
            {' wants to follow you.'}
            {time ? (
              <>
                {' '}
                <Text variant="caption" color="muted" style={{ fontSize: 11.5, lineHeight: 18 }}>
                  {time}
                </Text>
              </>
            ) : null}
          </Text>

          <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
            <Pill
              label="Decline"
              onPress={() => declineMutation.mutate(item.follow.uuid)}
              disabled={busy}
            />
            <Pill
              label="Accept"
              filled
              onPress={() => acceptMutation.mutate(item.follow.uuid)}
              disabled={busy}
            />
          </View>
        </View>
      )
    },
    [acceptMutation, busy, declineMutation, navigation, theme],
  )

  /**
   * Only reached with no rows to show, and the three cases are genuinely
   * different situations with different remedies — so they get different
   * words: "we are still asking", "we could not ask", and "we asked and there
   * is nothing".
   *
   * Before STOURIFY-86 there were two branches, and a failed request fell into
   * the empty one: a reader whose request had just timed out was told nobody
   * wants to follow them, which is a claim about their account rather than
   * about the network. The 15-second timeout in `shared/api/client.ts` makes
   * that routine.
   *
   * Two orderings here are load-bearing, and they are the same two `FeedScreen`
   * documents at length — read `FeedScreen.tsx:106-132` before changing this.
   *
   * **This lives inside `ListEmptyComponent`**, which only renders when the
   * list has no rows at all, so content always wins over an error. React Query
   * keeps serving requests it already holds while a later fetch fails; hoisting
   * an `isError` check above the `FlatList` would delete that protection and
   * never once show it had, because the branch is unreachable while online.
   *
   * **`isLoading` is asked before `isError`.** `isLoading` is true only for a
   * first fetch with nothing cached, so a slow first load shows skeletons
   * rather than a failure. `isError` then stays true through a retry until one
   * succeeds, which holds the failure message up while the retry is in flight
   * instead of flickering to the empty message and back.
   */
  const empty = isLoading ? (
    <View style={{ padding: theme.gutter, gap: theme.spacing[4] }}>
      <Skeleton height={AVATAR_SIZE + 18} />
      <Skeleton height={AVATAR_SIZE + 18} />
    </View>
  ) : isError ? (
    <EmptyState
      icon="📡"
      title="Couldn't load your requests"
      subtitle="We couldn't reach Stourify just now. Check your connection and try again."
      actionLabel="Try again"
      onAction={() => void refetch()}
    />
  ) : (
    <EmptyState
      icon="🔔"
      title="Nothing yet"
      subtitle="Follows, likes, comments and badge unlocks will land here."
    />
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      {/* Activity is the first screen of its own tab, so there is nothing in
          this stack to go back to. The artboard's back button goes to the
          Home feed, and so does this one. */}
      <BarHeader title="Activity" onBack={() => navigation.navigate('HomeTab')} />
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={renderItem}
        contentContainerStyle={
          rows.length === 0 ? { flex: 1 } : { paddingBottom: theme.spacing[4] }
        }
        ListEmptyComponent={empty}
      />
    </SafeAreaView>
  )
}

interface PillProps {
  label: string
  onPress: () => void
  disabled: boolean
  /** Slate fill for the row's main answer; an outline otherwise. */
  filled?: boolean
}

/**
 * The artboard's small round-ended `.fb` button ("Follow back"), used for
 * Accept and Decline. Drawn at 30 points and answering to the full 44 through
 * `hitSlop` — top and bottom only, so two pills side by side never claim each
 * other's taps.
 *
 * The label is Inter Medium rather than the design's 700, for the reason
 * `PostCard`'s spot pill gives: a shrink-wrapped one-line label in a heavier
 * Inter is measured short on Android (STOURIFY-263).
 */
function Pill({ label, onPress, disabled, filled = false }: PillProps) {
  const theme = useTheme()
  const slop = (theme.minTouchTarget - PILL_HEIGHT) / 2

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: slop, bottom: slop }}
      style={({ pressed }) => ({
        height: PILL_HEIGHT,
        paddingHorizontal: 13,
        borderRadius: PILL_HEIGHT / 2,
        justifyContent: 'center',
        backgroundColor: filled ? theme.colors.button : 'transparent',
        borderWidth: filled ? 0 : 1.5,
        borderColor: theme.colors.hairline,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text
        variant="caption"
        color={filled ? 'onButton' : 'ink'}
        style={{ fontSize: 12, lineHeight: 16 }}
      >
        {label}
      </Text>
    </Pressable>
  )
}
