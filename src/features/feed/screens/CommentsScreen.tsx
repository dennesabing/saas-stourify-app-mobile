import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FlatList, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { HomeStackParamList } from '@/shared/navigation/types'
import { createComment, getComments } from '@/shared/api/comments'
import { Avatar, EmptyState, Input, Text } from '@/shared/components/ui'
import { useAuthStore } from '@/shared/store/auth'
import type { Comment, PaginatedResponse } from '@/shared/api/types'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<HomeStackParamList, 'Comments'>

const COMMENTS_QUERY_KEY = (postId: string) => ['comments', postId] as const

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
  const { postId } = route.params
  const theme = useTheme()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [text, setText] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: COMMENTS_QUERY_KEY(postId),
    queryFn: () => getComments(postId),
  })

  const comments = data?.data ?? []
  const rows = useMemo(() => buildThread(comments), [comments])

  const postMutation = useMutation({
    mutationFn: (body: string) => createComment(postId, body),
    onMutate: async (body: string) => {
      await queryClient.cancelQueries({ queryKey: COMMENTS_QUERY_KEY(postId) })
      const previous = queryClient.getQueryData<PaginatedResponse<Comment>>(COMMENTS_QUERY_KEY(postId))

      const now = new Date().toISOString()
      const optimistic: Comment = {
        id: `optimistic-${Date.now()}`,
        body,
        visibility_type: 'org_member',
        user: user ? { id: user.uuid, name: user.name } : undefined,
        commentable_type: 'stourify_post',
        commentable_id: 0,
        parent_id: null,
        replies: [],
        created_at: now,
        updated_at: now,
        can: {},
      }

      queryClient.setQueryData<PaginatedResponse<Comment>>(COMMENTS_QUERY_KEY(postId), (old) => ({
        data: [...(old?.data ?? []), optimistic],
        links: old?.links ?? {},
        meta: old?.meta ?? { current_page: 1, last_page: 1, total: 1 },
      }))

      setText('')

      return { previous }
    },
    onError: (_err, _body, context) => {
      if (context?.previous) {
        queryClient.setQueryData(COMMENTS_QUERY_KEY(postId), context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: COMMENTS_QUERY_KEY(postId) })
    },
  })

  const handlePost = () => {
    const trimmed = text.trim()
    if (trimmed) postMutation.mutate(trimmed)
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <View style={{ padding: theme.gutter }}>
        <Text variant="h1">Comments</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row) => row.comment.id}
        contentContainerStyle={rows.length === 0 ? { flex: 1 } : { paddingHorizontal: theme.gutter, gap: theme.spacing[3] }}
        ListEmptyComponent={
          !isLoading
            ? () => <EmptyState icon="💬" title="No comments yet" subtitle="Be the first to say something" />
            : null
        }
        renderItem={({ item }) => (
          <View
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
    </SafeAreaView>
  )
}
