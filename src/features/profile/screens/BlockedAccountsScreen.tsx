import { useCallback } from 'react'
import { FlatList, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import { getBlocks, unblockUser, type Block } from '@/shared/api/blocks'
import { Avatar, Divider, EmptyState, Skeleton, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<ProfileStackParamList, 'BlockedAccounts'>

const BLOCKS_QUERY_KEY = ['blocks'] as const

/**
 * Blocked accounts — the list, and the only place Unblock can live.
 *
 * **Why this screen exists rather than a toggle on the other person's profile.**
 * The obvious home for Unblock is the same overflow menu that holds Block. It
 * cannot go there, because once the block stands that menu is unreachable:
 * `ProfileApiController::show()` refuses the blocker with the same 403 it gives
 * the blocked party, on purpose, so that a difference in responses cannot
 * announce the block (STOURIFY-36). Their profile renders "not available" for me
 * too — there is no header to hang a button on.
 *
 * `GET /blocks` is the blocker's own list and is the one surface a block never
 * hides, so this is where the action goes (STOURIFY-37).
 *
 * The rows come from `BlockResource`, which exposes `blocked` and never
 * `blocker` — a block has exactly one legitimate reader, and it is whoever made
 * it.
 */
export default function BlockedAccountsScreen({ navigation }: Props) {
  const theme = useTheme()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: BLOCKS_QUERY_KEY,
    queryFn: getBlocks,
  })

  const unblockMutation = useMutation({
    // The BLOCK row's uuid, not the explorer's. `DELETE /blocks` addresses the
    // row; sending a user uuid 404s — the same trap the unfollow path had.
    mutationFn: (blockUuid: string) => unblockUser(blockUuid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BLOCKS_QUERY_KEY })
      // Unblocking makes their content visible again wherever it was filtered.
      // The follows the block deleted stay deleted — the server is explicit
      // that it will not re-follow on anybody's behalf.
      queryClient.invalidateQueries({ queryKey: ['feed', 'following'] })
      queryClient.invalidateQueries({ queryKey: ['discover-search'] })
      queryClient.invalidateQueries({ queryKey: ['discover-people'] })
    },
  })

  const blocks = data?.data ?? []

  const renderRow = useCallback(
    ({ item }: { item: Block }) => {
      // `blocked` is a `whenLoaded` relation. The controller loads it on every
      // path today, but a row without it must render rather than take the screen
      // down — the same rule PostCard follows for a missing author.
      const name = item.blocked?.name ?? 'Unknown explorer'
      const pending = unblockMutation.isPending && unblockMutation.variables === item.uuid

      return (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing[3],
            paddingVertical: theme.spacing[3],
            paddingHorizontal: theme.gutter,
            minHeight: theme.minTouchTarget,
          }}
        >
          <Avatar name={item.blocked?.name} size={40} />

          <View style={{ flex: 1 }}>
            <Text variant="body" numberOfLines={1}>
              {name}
            </Text>
            {item.blocked?.username ? (
              <Text variant="caption" color="muted" numberOfLines={1}>
                @{item.blocked.username}
              </Text>
            ) : null}
          </View>

          <Pressable
            onPress={() => unblockMutation.mutate(item.uuid)}
            disabled={pending}
            accessibilityRole="button"
            accessibilityLabel={`Unblock ${name}`}
            accessibilityState={{ disabled: pending, busy: pending }}
            style={{
              minHeight: theme.minTouchTarget,
              justifyContent: 'center',
              paddingHorizontal: theme.spacing[4],
              borderRadius: theme.radius.button,
              borderWidth: 1,
              borderColor: theme.colors.hairline,
              opacity: pending ? 0.5 : 1,
            }}
          >
            <Text variant="button" color="primary">
              {pending ? 'Unblocking…' : 'Unblock'}
            </Text>
          </Pressable>
        </View>
      )
    },
    [theme, unblockMutation],
  )

  /**
   * Only reached with no rows to show, and the three cases are genuinely
   * different situations with different remedies — so they get different
   * words: "we are still asking", "we could not ask", and "we asked and there
   * is nothing".
   *
   * Before STOURIFY-87 there were two branches and they were in the wrong
   * place, which made this the worst sentence in the family to get wrong. A
   * failed `GET /blocks` fell into the empty one, so somebody opening this
   * screen to check that a block still stands was told they had blocked
   * nobody. That is safety copy, and it was confidently wrong. The 15-second
   * timeout in `shared/api/client.ts` makes it routine rather than exotic.
   *
   * Two orderings here are load-bearing, and they are the same two `FeedScreen`
   * documents at length — read `FeedScreen.tsx:106-132` before changing this.
   *
   * **This lives inside `ListEmptyComponent`**, which only renders when the
   * list has no rows at all, so content always wins over an error. The loading
   * check used to sit **above** the `FlatList`, deciding whether the list
   * existed at all; STOURIFY-87 unwound that before adding anything beside it,
   * because a branch that can replace the whole list is one edit away from
   * hiding rows the reader could still read — and it would never once show
   * that it had, since the branch is unreachable while the network is up.
   *
   * **`isLoading` is asked before `isError`.** `isLoading` is true only for a
   * first fetch with nothing cached, so a slow first load shows placeholders
   * rather than a failure. `isError` then stays true through a retry until one
   * succeeds, which holds the failure message up while the retry is in flight
   * instead of flickering to the empty message and back.
   */
  const empty = isLoading ? (
    <View style={{ padding: theme.gutter, gap: theme.spacing[3] }}>
      <Skeleton height={56} />
      <Skeleton height={56} />
    </View>
  ) : isError ? (
    <EmptyState
      icon="📡"
      title="Couldn't load your blocked list"
      subtitle="We couldn't reach Stourify just now. Check your connection and try again."
      actionLabel="Try again"
      onAction={() => void refetch()}
    />
  ) : (
    <EmptyState
      icon="🙂"
      title="Nobody blocked"
      subtitle="You have not blocked anyone. If someone bothers you, open their profile and choose Block."
    />
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[3],
          paddingHorizontal: theme.gutter,
          minHeight: theme.minTouchTarget,
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}
        >
          <Text variant="body" color="primary">
            ← Back
          </Text>
        </Pressable>
        <Text variant="h2">Blocked accounts</Text>
      </View>

      <FlatList
        testID="blocked-accounts-list"
        data={blocks}
        keyExtractor={(block) => block.uuid}
        renderItem={renderRow}
        ItemSeparatorComponent={() => <Divider />}
        contentContainerStyle={blocks.length === 0 ? { flex: 1 } : undefined}
        ListEmptyComponent={empty}
      />
    </SafeAreaView>
  )
}
