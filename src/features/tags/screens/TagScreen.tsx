import { useCallback, useMemo } from 'react'
import { Pressable, SectionList, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { HomeStackParamList } from '@/shared/navigation/types'
import { getPostsByTag, getSpotsByTag, getTag } from '@/shared/api/tags'
import type { Post, Spot } from '@/shared/api/types'
import { EmptyState, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

/**
 * Any of the three stacks this screen is registered on will do — the route's
 * shape is identical on all of them, and `PostDetail` and `SpotDetail` are
 * registered alongside it everywhere it appears.
 */
type Props = NativeStackScreenProps<HomeStackParamList, 'Tag'>

type Row = { kind: 'post'; key: string; post: Post } | { kind: 'spot'; key: string; spot: Spot }

interface Section {
  title: string
  data: Row[]
}

/** Empty sections are dropped rather than rendered as a header over nothing. */
function section(title: string, data: Row[]): Section[] {
  return data.length > 0 ? [{ title, data }] : []
}

/** Did this rejection come back as a genuine "no such thing", or just fail? */
function isNotFound(error: unknown): boolean {
  return (error as { response?: { status?: number } })?.response?.status === 404
}

/**
 * Everything carrying one hashtag.
 *
 * ## Five situations, and why they are not four
 *
 * `SearchScreen` already worked out the hard part of this and its comment
 * explains the incident: until STOURIFY-59 its "no results" message appeared
 * when the request had **failed**, so the screen reported that nothing matched
 * when it had never found out. A reader told there are no results goes and
 * looks for something else; a reader told the request failed tries again, which
 * is the one move that helps. That family of defects is STOURIFY-85 to
 * STOURIFY-90.
 *
 * So this screen copies that four-branch shape rather than inventing another
 * arrangement of the same states, and adds the one a tag page has that a search
 * does not — **the tag itself may not exist**:
 *
 * | What is true | What it says |
 * |---|---|
 * | still asking | *Loading #x…* |
 * | the lookup answered `404` | *No such tag* |
 * | anything else failed | *Couldn't load* + Try again |
 * | the tag exists, nothing visible carries it | *Nothing tagged #x yet* |
 * | there is content | the list |
 *
 * The second and third are the pair worth being careful about. A `404` is the
 * server saying *nobody has ever typed this word*; a `500`, a timeout or a
 * dropped radio is the server saying nothing at all, and the tag may well
 * exist. Collapsing them would invent an answer, which is the same mistake in a
 * different costume — and it is why STOURIFY-172 built the lookup as its own
 * request that can answer `404`.
 *
 * ## Why the branches live inside `ListEmptyComponent`
 *
 * It renders only when the list has no rows, so **content always wins over an
 * error**. React Query keeps serving results it already holds while a later
 * fetch fails, and the reader keeps reading them. Hoisting an `isError` check
 * above the `SectionList` would delete that and never once show it had, because
 * the branch is unreachable while online. `SearchScreen`, `FeedScreen`,
 * `DiscoverScreen` and `NearbyScreen` all carry the same warning.
 */
export default function TagScreen({ navigation, route }: Props) {
  const theme = useTheme()
  const { slug } = route.params

  const tagQuery = useQuery({
    queryKey: ['tag', slug],
    queryFn: () => getTag(slug),
    // A missing tag is an answer, not a glitch: retrying a `404` delays the
    // right sentence and never changes it. Anything else gets the one retry the
    // app gives every request (`createQueryClient`) — this override exists to
    // carve out the `404`, not to try harder than the rest of the app does.
    retry: (count, error) => !isNotFound(error) && count < 1,
  })

  const contentQuery = useQuery({
    queryKey: ['tag-content', slug],
    queryFn: async () => {
      // `allSettled`, not `all`, and the difference is the whole behaviour. The
      // two lists are independent: one can time out while the other is already
      // in hand, and `all` would throw the arrived one away to report the
      // failure. Found on a real emulator (STOURIFY-173) — the spots listing
      // outran the client's fifteen-second patience while the posts had already
      // come back, and the page said it could not load over a post it was
      // holding. Ordering a starter and a main course does not mean going
      // hungry because the kitchen burnt the soup.
      const [posts, spots] = await Promise.allSettled([getPostsByTag(slug), getSpotsByTag(slug)])

      return {
        posts: posts.status === 'fulfilled' ? (posts.value.data ?? []) : [],
        spots: spots.status === 'fulfilled' ? (spots.value.data ?? []) : [],
        // Remembered rather than swallowed. With rows on screen it changes
        // nothing, because the error branch only renders over an empty list —
        // but with nothing to show, a half that broke must not be reported as a
        // tag with nothing on it.
        halfFailed: posts.status === 'rejected' || spots.status === 'rejected',
      }
    },
  })

  const missing = tagQuery.isError && isNotFound(tagQuery.error)
  const failed =
    (tagQuery.isError && !missing) || contentQuery.isError || contentQuery.data?.halfFailed === true
  const loading = tagQuery.isPending || contentQuery.isPending

  const heading = tagQuery.data ? `#${tagQuery.data.name}` : `#${slug}`

  const sections = useMemo<Section[]>(() => {
    const data = contentQuery.data

    if (!data) return []

    return [
      ...section(
        'Posts',
        data.posts.map((post) => ({ kind: 'post' as const, key: `post-${post.uuid}`, post })),
      ),
      ...section(
        'Spots',
        data.spots.map((spot) => ({ kind: 'spot' as const, key: `spot-${spot.uuid}`, spot })),
      ),
    ]
  }, [contentQuery.data])

  const retry = useCallback(() => {
    void tagQuery.refetch()
    void contentQuery.refetch()
  }, [tagQuery, contentQuery])

  const renderRow = useCallback(
    ({ item }: { item: Row }) => {
      const rowStyle = {
        paddingHorizontal: theme.gutter,
        paddingVertical: theme.spacing[3],
        minHeight: theme.minTouchTarget,
        justifyContent: 'center' as const,
      }

      if (item.kind === 'post') {
        const { post } = item

        return (
          <Pressable
            style={rowStyle}
            accessibilityRole="button"
            onPress={() => navigation.navigate('PostDetail', { postId: post.uuid })}
          >
            <Text variant="body" numberOfLines={2}>
              {post.caption ?? 'Untitled post'}
            </Text>
            {post.author?.name ? (
              <Text variant="caption" color="muted">
                {post.author.name}
              </Text>
            ) : null}
          </Pressable>
        )
      }

      const { spot } = item

      return (
        <Pressable
          style={rowStyle}
          accessibilityRole="button"
          onPress={() => navigation.navigate('SpotDetail', { spotId: spot.uuid })}
        >
          <Text variant="body">{spot.title}</Text>
          {spot.address ? (
            <Text variant="caption" color="muted">
              {spot.address}
            </Text>
          ) : null}
        </Pressable>
      )
    },
    [navigation, theme],
  )

  const renderSectionHeader = useCallback(
    ({ section: { title } }: { section: Section }) => (
      <View
        style={{
          paddingHorizontal: theme.gutter,
          paddingTop: theme.spacing[4],
          paddingBottom: theme.spacing[2],
          backgroundColor: theme.colors.surface,
        }}
      >
        <Text variant="micro" color="muted">
          {title}
        </Text>
      </View>
    ),
    [theme],
  )

  /**
   * The order of these branches is the whole point, and each one is asked
   * before any branch it must beat.
   *
   * `missing` goes first: a `404` is a definite answer, and treating it as a
   * failure would offer a Try again button that can only ever produce the same
   * `404`. `failed` goes next, so a failure is never reported as emptiness.
   * `loading` sits between them and the empty case, so a slow request does not
   * flash "nothing here" on its way to having something.
   */
  const empty = missing ? (
    <EmptyState
      icon="🔎"
      title="No such tag"
      subtitle={`Nobody has used #${slug} yet. Check the spelling, or be the first to write it.`}
    />
  ) : failed ? (
    <EmptyState
      icon="📡"
      title="Couldn't load this tag"
      subtitle="We couldn't reach Stourify just now. Check your connection and try again."
      actionLabel="Try again"
      onAction={retry}
    />
  ) : loading ? (
    <EmptyState icon="⏳" title={`Loading ${heading}…`} />
  ) : (
    <EmptyState
      icon="🏷️"
      title={`Nothing tagged ${heading} yet`}
      subtitle="This tag exists, but nothing you can see is carrying it right now."
    />
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <View style={{ padding: theme.gutter }}>
        <Text variant="display">{heading}</Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.key}
        renderItem={renderRow}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={empty}
        contentContainerStyle={
          sections.length === 0 ? { flex: 1 } : { paddingBottom: theme.spacing[4] }
        }
      />
    </SafeAreaView>
  )
}
