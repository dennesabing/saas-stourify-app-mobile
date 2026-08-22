import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FlatList, KeyboardAvoidingView, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CommentThreadTarget, HomeStackParamList } from '@/shared/navigation/types'
import {
  createComment,
  createSpotAboutComment,
  getComments,
  getSpotAboutComments,
} from '@/shared/api/comments'
import { Avatar, EmptyState, Input, Text } from '@/shared/components/ui'
import { useAuthStore } from '@/shared/store/auth'
import type { Comment, PaginatedResponse } from '@/shared/api/types'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<HomeStackParamList, 'Comments'>

/**
 * One key namespace for both hosts, deliberately.
 *
 * Every id this API hands out is a UUID, and UUIDs do not repeat across
 * resources — so a post's thread and an About entry's thread can share one
 * namespace without ever colliding. Adding a discriminator would read a little
 * more plainly and would buy nothing (STOURIFY-148).
 */
const COMMENTS_QUERY_KEY = (hostId: string) => ['comments', hostId] as const

/**
 * Everything this screen needs to know about WHAT it is showing comments on.
 *
 * The screen is one reading room with two doors. A post and a Spot About entry
 * are different things to comment on, and the differences are exactly these
 * four lines — which endpoint lists the thread, which one adds to it, the name
 * the host is filed under, and what else has to be refreshed afterwards. Every
 * other behaviour on this screen (flattening replies, telling an error apart
 * from an empty thread, the optimistic composer, lifting the composer above the
 * keyboard) was never about posts and is written once.
 *
 * Writing the difference as one object rather than scattering `if` statements
 * through the file is what lets a reader check that claim: if something host-
 * specific is not in here, it does not exist.
 */
interface CommentHost {
  /** The UUID in the URL — a post's or an About entry's. */
  id: string
  /** The name this kind of record is filed under in a polymorphic column. */
  morphAlias: string
  list: () => Promise<PaginatedResponse<Comment>>
  create: (body: string) => Promise<Comment>
  /**
   * Anything else that has gone stale now a reply exists, or nothing.
   *
   * An About entry carries a reply count that the SERVER computes and that the
   * screen behind this one is showing. Without this, going back lands on a
   * count one short of the thread you just added to — which reads as the reply
   * not having saved. A post has no such number anywhere, so it pays nothing.
   */
  refreshBehind?: () => void
}

interface ThreadRow {
  comment: Comment
  depth: number
}

/**
 * Flattens top-level comments with their replies (matched client-side by
 * `parent_id`) into depth-ordered rows — `PostResource`'s comments endpoint
 * does not eager-load `replies`.
 */
function buildThread(comments: Comment[]): ThreadRow[] {
  const byParent = new Map<string, Comment[]>()

  for (const comment of comments) {
    const key = comment.parent_id ?? 'root'
    const bucket = byParent.get(key) ?? []
    bucket.push(comment)
    byParent.set(key, bucket)
  }

  const rows: ThreadRow[] = []

  function walk(parentKey: string, depth: number) {
    for (const comment of byParent.get(parentKey) ?? []) {
      rows.push({ comment, depth })
      walk(comment.id, depth + 1)
    }
  }

  walk('root', 0)

  return rows
}

export default function CommentsScreen({ route }: Props) {
  const theme = useTheme()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [text, setText] = useState('')

  const target: CommentThreadTarget = route.params

  /**
   * Which door the reader came through. `'postId' in target` is the whole test
   * — the route parameter carries one key or the other and never both, so the
   * key that is present IS the answer.
   */
  const host: CommentHost =
    'postId' in target
      ? {
          id: target.postId,
          morphAlias: 'stourify_post',
          list: () => getComments(target.postId),
          create: (body: string) => createComment(target.postId, body),
        }
      : {
          id: target.spotAboutId,
          morphAlias: 'stourify_spot_about',
          list: () => getSpotAboutComments(target.spotAboutId),
          create: (body: string) => createSpotAboutComment(target.spotAboutId, body),
          refreshBehind: () => void queryClient.invalidateQueries({ queryKey: ['spot-abouts'] }),
        }

  const hostId = host.id

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: COMMENTS_QUERY_KEY(hostId),
    queryFn: () => host.list(),
  })

  const comments = data?.data ?? []
  const rows = useMemo(() => buildThread(comments), [comments])

  const postMutation = useMutation({
    mutationFn: (body: string) => host.create(body),
    onMutate: async (body: string) => {
      await queryClient.cancelQueries({ queryKey: COMMENTS_QUERY_KEY(hostId) })
      const previous = queryClient.getQueryData<PaginatedResponse<Comment>>(COMMENTS_QUERY_KEY(hostId))

      const now = new Date().toISOString()
      const optimistic: Comment = {
        id: `optimistic-${Date.now()}`,
        body,
        visibility_type: 'org_member',
        user: user ? { id: user.uuid, name: user.name } : undefined,
        commentable_type: host.morphAlias,
        commentable_id: 0,
        parent_id: null,
        replies: [],
        created_at: now,
        updated_at: now,
        can: {},
      }

      queryClient.setQueryData<PaginatedResponse<Comment>>(COMMENTS_QUERY_KEY(hostId), (old) => ({
        // At the FRONT, because that is where the server will put it.
        //
        // An optimistic update's only job is to predict the answer that is
        // coming. Both comment endpoints answer newest-first — `->latest()` in
        // `PostCommentApiController::index` and
        // `SpotAboutCommentApiController::index` — so a row appended to the end
        // was a prediction that the refetch contradicted a second later, and
        // the comment you had just written jumped from the bottom of the thread
        // to the top while you were looking at it (STOURIFY-151).
        data: [optimistic, ...(old?.data ?? [])],
        links: old?.links ?? {},
        meta: old?.meta ?? { current_page: 1, last_page: 1, total: 1 },
      }))

      setText('')

      return { previous }
    },
    onError: (_err, _body, context) => {
      if (context?.previous) {
        queryClient.setQueryData(COMMENTS_QUERY_KEY(hostId), context.previous)
      }
    },
    onSuccess: () => host.refreshBehind?.(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: COMMENTS_QUERY_KEY(hostId) })
    },
  })

  const handlePost = () => {
    const trimmed = text.trim()
    if (trimmed) postMutation.mutate(trimmed)
  }

  /**
   * Only reached with no rows to show, and the three cases are genuinely
   * different situations with different remedies — so they get different
   * words: "we are still asking", "we could not ask", and "we asked and there
   * is nothing".
   *
   * Before STOURIFY-86 there were two branches, and a failed request fell into
   * the empty one: a reader whose request had just timed out was told the post
   * has no comments, which is a claim about the post rather than about the
   * network. The 15-second timeout in `shared/api/client.ts` makes that routine.
   *
   * Two orderings here are load-bearing, and they are the same two `FeedScreen`
   * documents at length — read `FeedScreen.tsx:106-132` before changing this.
   *
   * **This lives inside `ListEmptyComponent`**, which only renders when the
   * list has no rows at all, so content always wins over an error. React Query
   * keeps serving comments it already holds while a later fetch fails; hoisting
   * an `isError` check above the `FlatList` would delete that protection and
   * never once show it had, because the branch is unreachable while online.
   *
   * **`isLoading` is asked before `isError`.** `isLoading` is true only for a
   * first fetch with nothing cached, so a slow first load stays quiet rather
   * than claiming a failure. `isError` then stays true through a retry until
   * one succeeds, which holds the failure message up while the retry is in
   * flight instead of flickering to the empty message and back.
   */
  const empty = isLoading ? null : isError ? (
    <EmptyState
      icon="📡"
      title="Couldn't load the comments"
      subtitle="We couldn't reach Stourify just now. Check your connection and try again."
      actionLabel="Try again"
      onAction={() => void refetch()}
    />
  ) : (
    <EmptyState icon="💬" title="No comments yet" subtitle="Be the first to say something" />
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      {/* STOURIFY-100: the composer is docked at the bottom, so under edge-to-edge —
          where Android no longer shrinks the window — the keyboard covers it outright. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={{ padding: theme.gutter }}>
          <Text variant="h1">Comments</Text>
        </View>

        <FlatList
          data={rows}
          keyExtractor={(row) => row.comment.id}
          contentContainerStyle={rows.length === 0 ? { flex: 1 } : { paddingHorizontal: theme.gutter, gap: theme.spacing[3] }}
          ListEmptyComponent={empty}
          renderItem={({ item }) => (
            <View
              /* Named so a test can ask where a row was DRAWN, not merely
                 whether its words appeared. The indentation is the whole of
                 what makes a reply read as an answer, and an assertion that
                 only checks the text is on screen passes just as happily when
                 every reply is flattened to the left margin — which is exactly
                 the failure STOURIFY-152 fixed. */
              testID={`comment-row-${item.comment.id}`}
              style={{
                flexDirection: 'row',
                gap: theme.spacing[2],
                marginLeft: item.depth * theme.spacing[6],
              }}
            >
              <Avatar name={item.comment.user?.name} size={28} />
              <View style={{ flex: 1 }}>
                <Text variant="caption" color="primary">
                  {item.comment.user?.name ?? 'User'}
                </Text>
                <Text variant="body">{item.comment.body}</Text>
              </View>
            </View>
          )}
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing[2],
            padding: theme.gutter,
            borderTopWidth: 1,
            borderTopColor: theme.colors.hairline,
          }}
        >
          <View style={{ flex: 1 }}>
            <Input placeholder="Add a comment..." value={text} onChangeText={setText} />
          </View>
          <Pressable
            onPress={handlePost}
            disabled={!text.trim()}
            accessibilityRole="button"
            accessibilityLabel="Post comment"
            style={{
              minHeight: theme.minTouchTarget,
              minWidth: theme.minTouchTarget,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: text.trim() ? 1 : 0.5,
            }}
          >
            <Text variant="h2" color="primary">
              ↑
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
