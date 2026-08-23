import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createSpotAbout, getSpotAbouts } from '@/shared/api/spotAbouts'
import { addReaction, removeReaction } from '@/shared/api/reactions'
import type { PaginatedResponse, SpotAbout } from '@/shared/api/types'
import { Avatar, EmptyState, Input, Skeleton, Text } from '@/shared/components/ui'
import { formatRelativeTime } from '@/shared/utils/relativeTime'
import { useTheme } from '@/theme/ThemeProvider'

/**
 * The corkboard on a spot's About tab.
 *
 * A spot has one description, written once by whoever added it — the brass
 * plaque beside a landmark. This is the corkboard hung next to it: short notes
 * any visitor can pin up, and other visitors thumbs-up the ones that turned out
 * to be true, so the board sorts itself and the useful notes sit at the top.
 *
 * The plaque is NOT here. `SpotDetailScreen` still renders the spot's own
 * description, address and coordinates above this component, because they are a
 * different kind of fact and this feature was never meant to replace them
 * (STOURIFY-147, first `ASSUMPTION:` note).
 *
 * @see specs/2026-08-22-spot-about-design.md
 */

/**
 * The name About entries are filed under in every polymorphic column, and the
 * only spelling the platform's reactions endpoint accepts for them. It is a
 * short nickname registered in the server's morph map, deliberately not the PHP
 * class name — the alias is the contract, and the class can move without a data
 * migration.
 */
const SPOT_ABOUT_ALIAS = 'stourify_spot_about'

const ABOUTS_QUERY_KEY = (spotUuid: string) => ['spot-abouts', spotUuid] as const

/** The server's own cap on `body` (`SpotAboutStoreRequest`), felt while typing. */
const BODY_MAX = 2000

interface Props {
  spotUuid: string
  /**
   * Open one note's replies.
   *
   * A callback rather than a `useNavigation()` call, because nothing in this
   * app's `src/` looks navigation up — every screen is handed it as a prop —
   * and the jest harness mounts components without a navigation container, so
   * a hook here would throw in every test that renders the tab.
   */
  onOpenThread: (spotAboutUuid: string) => void
}

export default function SpotAboutTab({ spotUuid, onOpenThread }: Props) {
  const theme = useTheme()
  const queryClient = useQueryClient()
  const [text, setText] = useState('')

  const queryKey = ABOUTS_QUERY_KEY(spotUuid)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => getSpotAbouts(spotUuid),
  })

  const abouts = data?.data ?? []

  /**
   * Rewrite one row inside the cached page, leaving every other row alone.
   *
   * React Query hands back the object it is holding, so it must not be edited
   * in place — a mutated cache entry looks unchanged to React and the screen
   * does not redraw. Everything here is copied.
   */
  function patchRow(uuid: string, patch: (about: SpotAbout) => SpotAbout) {
    queryClient.setQueryData<PaginatedResponse<SpotAbout>>(queryKey, (old) =>
      old ? { ...old, data: old.data.map((row) => (row.uuid === uuid ? patch(row) : row)) } : old,
    )
  }

  /**
   * Tapping a heart.
   *
   * Two things are going on, and both are deliberate.
   *
   * **The screen changes before the network answers.** This is an *optimistic
   * update*: flip the heart now, send the request, and put the screen back if
   * the server refuses. A heart that waits 300 milliseconds to fill in reads as
   * a broken button, and the wrong frame is rare while the slow frame is every
   * single time.
   *
   * **Adding and removing are different calls, not one toggle.** The server
   * would accept a second POST of the same reaction and read it as "take it
   * back", which is one call instead of two — but it hands the decision to
   * whichever side has the staler idea of the current state, and that is the
   * app. If another device liked this note a second ago, a toggle turns "like
   * this" into "unlike this" and the count goes DOWN. Saying `add` or `remove`
   * states an intention, and removal is then idempotent: a double tap does
   * nothing further instead of flipping back.
   */
  const likeMutation = useMutation({
    mutationFn: ({ uuid, liked }: { uuid: string; liked: boolean }) =>
      liked ? removeReaction(SPOT_ABOUT_ALIAS, uuid) : addReaction(SPOT_ABOUT_ALIAS, uuid),

    onMutate: async ({ uuid, liked }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<PaginatedResponse<SpotAbout>>(queryKey)

      patchRow(uuid, (row) => ({
        ...row,
        is_liked: !liked,
        likes_count: Math.max(0, row.likes_count + (liked ? -1 : 1)),
      }))

      return { previous }
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous)
      }
    },

    /**
     * The server's answer replaces the guess.
     *
     * The optimistic arithmetic only knows about this one tap. The response
     * carries the real total, which also accounts for everyone else who tapped
     * while this request was in the air — so a count that was quietly one short
     * corrects itself here instead of staying wrong until the next refetch.
     */
    onSuccess: (state, { uuid }) => {
      patchRow(uuid, (row) => ({
        ...row,
        is_liked: state.reacted,
        likes_count: state.counts.like ?? 0,
      }))
    },
  })

  /**
   * Writing a note.
   *
   * Note what this does NOT do: it does not place the new row itself. The list
   * is sorted by likes and the app does not own that sort — a brand-new note
   * has none, so its true position depends on rows this page may not even be
   * holding. Every fixed guess is wrong some of the time, and the symptom is
   * the worst kind: the note appears, then jumps somewhere else a moment later.
   * Asking the server again costs one request and is right every time.
   */
  const createMutation = useMutation({
    mutationFn: (body: string) => createSpotAbout(spotUuid, body),
    onSuccess: () => setText(''),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const trimmed = text.trim()
  const canPost = trimmed.length > 0 && !createMutation.isPending

  function handlePost() {
    if (!canPost) return
    createMutation.mutate(trimmed)
  }

  const now = Date.now()

  /**
   * Three situations, three different sentences, asked in this order.
   *
   * They all show no notes and they are not the same claim: "we are still
   * asking", "we could not ask", and "we asked and there is nothing". Telling a
   * reader whose network just dropped that a spot has no notes is a statement
   * about the spot rather than about the network.
   *
   * `isLoading` comes first because it is true only for a first fetch with
   * nothing cached, so a slow start stays quiet instead of claiming a failure.
   * The error branch is gated on there being no rows, so a reader offline on a
   * spot they read yesterday keeps their notes rather than losing them to an
   * apology — the same rule `CommentsScreen` and `FeedScreen` already follow.
   */
  function renderList() {
    if (isLoading) {
      return (
        <View testID="spot-abouts-loading" style={{ gap: theme.spacing[3] }}>
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      )
    }

    if (abouts.length === 0 && isError) {
      return (
        <EmptyState
          icon="📡"
          title="Couldn't load the notes"
          subtitle="We couldn't reach Stourify just now. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void refetch()}
        />
      )
    }

    if (abouts.length === 0) {
      return (
        <EmptyState
          icon="📌"
          title="No notes yet"
          subtitle="Been here? Add what somebody arriving would want to know."
        />
      )
    }

    return (
      <View style={{ gap: theme.spacing[4] }}>
        {abouts.map((about) => {
          const liked = about.is_liked === true

          return (
            <View
              key={about.uuid}
              testID="spot-about-row"
              style={{ flexDirection: 'row', gap: theme.spacing[2] }}
            >
              <Avatar uri={about.author?.avatar_url} name={about.author?.name} size={32} />

              <View style={{ flex: 1, gap: theme.spacing[1] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
                  <Text
                    variant="caption"
                    color="primary"
                    numberOfLines={1}
                    style={{ flexShrink: 1 }}
                  >
                    {about.author?.name ?? 'Someone'}
                  </Text>
                  <Text variant="caption" color="muted">
                    {formatRelativeTime(Date.parse(about.created_at), now)}
                  </Text>
                </View>

                <Text variant="body">{about.body}</Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[4] }}>
                  <Pressable
                    testID={`spot-about-like-${about.uuid}`}
                    accessibilityRole="button"
                    accessibilityLabel={liked ? 'Remove your like' : 'Like this note'}
                    accessibilityState={{ selected: liked }}
                    onPress={() => likeMutation.mutate({ uuid: about.uuid, liked })}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing[1],
                      minHeight: theme.minTouchTarget,
                      minWidth: theme.minTouchTarget,
                    }}
                  >
                    <Text variant="body" color={liked ? 'danger' : 'muted'}>
                      {liked ? '♥' : '♡'}
                    </Text>
                    <Text variant="body" color="muted">
                      {about.likes_count}
                    </Text>
                  </Pressable>

                  {/*
                    How many people replied, and the way into the conversation
                    (STOURIFY-148). STOURIFY-147 shipped this as plain text on
                    purpose, because the thread screen could not yet be reached
                    from a spot and a control that opens nothing is worse than
                    none at all. It can be now, so the number is the door.

                    `typeof … === 'number'` rather than a truthiness test, because
                    the server OMITS this field when it did not count, and zero is
                    a real answer. Drawing "0 replies" over a field nobody looked
                    up is a confident answer to a question that was never asked —
                    and it would put a door on a wall with no room behind it.
                  */}
                  {typeof about.comments_count === 'number' ? (
                    <Pressable
                      testID={`spot-about-comments-${about.uuid}`}
                      accessibilityRole="button"
                      accessibilityLabel="View replies"
                      onPress={() => onOpenThread(about.uuid)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        minHeight: theme.minTouchTarget,
                        minWidth: theme.minTouchTarget,
                      }}
                    >
                      <Text variant="caption" color="muted">
                        {`💬 ${about.comments_count}`}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          )
        })}
      </View>
    )
  }

  return (
    <View style={{ gap: theme.spacing[4] }}>
      {renderList()}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[2],
          paddingTop: theme.spacing[3],
          borderTopWidth: 1,
          borderTopColor: theme.colors.hairline,
        }}
      >
        <View style={{ flex: 1 }}>
          <Input
            testID="spot-about-composer"
            placeholder="Add what you know about this place..."
            value={text}
            onChangeText={setText}
            multiline
            maxLength={BODY_MAX}
            error={
              createMutation.isError
                ? "That didn't send. Check your connection and try again."
                : undefined
            }
          />
        </View>

        <Pressable
          onPress={handlePost}
          disabled={!canPost}
          accessibilityRole="button"
          accessibilityLabel="Post note"
          style={{
            minHeight: theme.minTouchTarget,
            minWidth: theme.minTouchTarget,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: canPost ? 1 : 0.5,
          }}
        >
          <Text variant="h2" color="primary">
            ↑
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
