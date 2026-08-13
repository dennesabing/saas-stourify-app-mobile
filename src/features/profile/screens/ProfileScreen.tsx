import { useCallback, useState } from 'react'
import { Dimensions, FlatList, Image, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import { getMyProfile, getProfile, type ExplorerProfile } from '@/shared/api/profiles'
import { getPosts, getUserPosts } from '@/shared/api/posts'
import { follow, unfollow } from '@/shared/api/follows'
import { blockUser } from '@/shared/api/blocks'
import { extractApiError } from '@/shared/api/client'
import ReportSheet from '@/features/social/components/ReportSheet'
import {
  Avatar,
  Button,
  Chip,
  Divider,
  EmptyState,
  Sheet,
  SheetOption,
  Skeleton,
  Text,
} from '@/shared/components/ui'
import { useAuthStore } from '@/shared/store/auth'
import type { Post } from '@/shared/api/types'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<ProfileStackParamList, 'Profile'>

const COLUMNS = 3
const GRID_GAP = 2

/**
 * The explorer identity surface — mine and anyone else's, one screen.
 *
 * Which profile it shows is decided by `route.params.userId`: absent (or my own
 * uuid) means mine. That single-screen shape is deliberate — the two differ
 * only in which endpoint feeds them and which action sits under the header, and
 * splitting them would duplicate the whole header for one button.
 *
 * **Two endpoints, and the distinction is not cosmetic** (STOURIFY-35). This
 * screen used to read `GET /users/{uuid}` — the boilerplate's platform-user
 * route — which carries a name, an email and an avatar and nothing else. There
 * is no username, bio, home city or follower count on it, which is why the
 * counts were hardcoded to a literal "–" and the Follow button always read
 * "Follow" no matter the relationship. The explorer identity lives on
 * `GET /profile` and `GET /profiles/{user}`.
 *
 * Four read outcomes are ordinary rather than exceptional, and each gets its
 * own render:
 *
 * - **`null` from `GET /profile`** — no profile row. Not an error, and since
 *   STOURIFY-82 not the normal first-run state either: registration now creates
 *   the row. This branch remains for accounts registered before that shipped,
 *   and it offers *Set up profile*.
 * - **any failure on MY OWN profile** — a bad connection or a server fault. It
 *   says so in the first person and offers a retry. It used to share the
 *   stranger's message below, which is how a brand-new user came to be told
 *   "This explorer has not set up their profile yet" about themselves, with no
 *   way forward (STOURIFY-82).
 * - **404 on somebody else's** — that explorer never created a profile.
 * - **403** — a block stands between the two parties. The server's wording is
 *   identical from either side by design (STOURIFY-36), so the client must not
 *   try to explain it either.
 */
export default function ProfileScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuthStore()

  const routeUserId = route.params?.userId
  const isOwn = !routeUserId || routeUserId === currentUser?.uuid
  const targetId = isOwn ? (currentUser?.uuid ?? '') : routeUserId

  // Which stack this screen was pushed onto decides what it may navigate to.
  // It is registered on Home, Discover, Activity and Profile, and only the
  // Profile stack carries EditProfile/Settings/FollowList — tapping my own post
  // in the feed lands me on my OWN profile inside the Home stack, where those
  // routes do not exist and navigating to one throws.
  // Widened to `string[]`: the prop types claim the Profile stack's names, but
  // the value is whichever stack actually pushed this screen — that mismatch is
  // the whole reason the check exists.
  const routeNames: string[] = navigation.getState?.()?.routeNames ?? []
  const canOpen = useCallback(
    (name: string) => routeNames.includes(name),
    [routeNames],
  )

  const profileQuery = useQuery({
    queryKey: ['explorer-profile', isOwn ? 'me' : targetId],
    queryFn: () => (isOwn ? getMyProfile() : getProfile(targetId)),
    enabled: isOwn || targetId !== '',
  })

  const postsQuery = useQuery({
    queryKey: ['explorer-posts', isOwn ? 'me' : targetId],
    queryFn: () => (isOwn ? getPosts({ mine: true }) : getUserPosts(targetId)),
    enabled: isOwn || targetId !== '',
  })

  const profile = profileQuery.data ?? null
  const posts = postsQuery.data?.data ?? []
  const viewer = profile?.viewer

  function invalidateProfile(): void {
    queryClient.invalidateQueries({ queryKey: ['explorer-profile', isOwn ? 'me' : targetId] })
  }

  const followMutation = useMutation({
    mutationFn: () => follow(targetId),
    onSuccess: invalidateProfile,
  })

  // The EDGE's uuid, never the user's — `DELETE /follows/{uuid}` addresses the
  // row. The viewer block carries it precisely so this screen does not have to
  // page the follow list to find it.
  const unfollowMutation = useMutation({
    mutationFn: () => unfollow(viewer?.follow_uuid ?? ''),
    onSuccess: invalidateProfile,
  })

  // ── Block and report (STOURIFY-37) ────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmingBlock, setConfirmingBlock] = useState(false)
  const [reporting, setReporting] = useState(false)

  /**
   * A block changes what several endpoints return, not one row, so the caches
   * are dropped rather than edited.
   *
   * The like button on this same screen patches its cache optimistically, and
   * that is right for a single boolean on a single post. It is wrong here: a
   * block filters the feed, the search results, the post lists and the profile,
   * across pages already loaded and pages not yet fetched, and the server has
   * just cleared its own caches for exactly the same reason. Letting the server
   * answer is both simpler and correct, and a block is rare enough that the
   * refetch costs nothing anyone notices.
   *
   * **`resetQueries`, not `invalidateQueries`, for the content lists — and the
   * live run is why.** Invalidating marked them stale and genuinely issued the
   * refetches (the backend log shows `/feed`, `/discover/search` and `/posts`
   * being re-requested the moment the block landed), and the blocked explorer's
   * post *still* sat at the top of the feed a minute and a half later. It only
   * left after a manual pull-to-refresh. Invalidation keeps the old pages on
   * screen until every refetch it started resolves — which for the feed's
   * infinite query means every page already loaded — so one slow or failed page
   * leaves the whole list showing exactly the content the block was meant to
   * remove. Resetting drops the cached pages outright: the list has nothing
   * stale left to render, and refetches from the first page. The cost is a
   * moment of skeleton on a screen the reader is being returned to anyway.
   */
  const blockMutation = useMutation({
    mutationFn: () => blockUser(targetId),
    onSuccess: () => {
      queryClient.resetQueries({ queryKey: ['feed', 'following'] })
      queryClient.resetQueries({ queryKey: ['discover-search'] })
      queryClient.resetQueries({ queryKey: ['discover-people'] })
      queryClient.resetQueries({ queryKey: ['explorer-profile', targetId] })
      queryClient.resetQueries({ queryKey: ['explorer-posts', targetId] })
      queryClient.invalidateQueries({ queryKey: ['blocks'] })

      setConfirmingBlock(false)
      // Leaving is not a nicety: this screen's next read of
      // `GET /profiles/{them}` is now a 403, so staying would swap the header
      // for the "not available" state under the reader's hands.
      navigation.goBack()
    },
  })

  const width = Dimensions.get('window').width
  const tile = Math.floor((width - GRID_GAP * (COLUMNS - 1)) / COLUMNS)

  const renderTile = useCallback(
    ({ item }: { item: Post }) => {
      const photo = item.media?.[0]

      return (
        <Pressable
          onPress={() => navigation.navigate('PostDetail', { postId: item.uuid })}
          accessibilityRole="button"
          accessibilityLabel={item.caption ? `Post: ${item.caption}` : 'Post'}
          style={{
            width: tile,
            height: tile,
            backgroundColor: theme.colors.surfaceAlt,
            marginBottom: GRID_GAP,
          }}
        >
          {photo ? (
            <Image
              source={{ uri: photo.thumb_url ?? photo.url }}
              style={{ width: tile, height: tile }}
              resizeMode="cover"
            />
          ) : null}
        </Pressable>
      )
    },
    [navigation, theme.colors.surfaceAlt, tile],
  )

  function renderFrame(children: React.ReactNode) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
        {children}
      </SafeAreaView>
    )
  }

  if (profileQuery.isLoading) {
    return renderFrame(
      <View style={{ padding: theme.gutter, gap: theme.spacing[4] }}>
        <Skeleton height={88} width={88} />
        <Skeleton height={24} width="60%" />
        <Skeleton height={64} />
      </View>,
    )
  }

  if (profileQuery.isError) {
    const status = (profileQuery.error as { response?: { status?: number } })?.response?.status

    // Your own profile failing to load and a stranger's not existing are
    // different facts, and until STOURIFY-82 they shared one message. A newly
    // registered user tapping Profile was told "This explorer has not set up
    // their profile yet" — third person, about themselves — with *Go back* as
    // the only control, which is not a way out of anything. A read that failed
    // is worth retrying; a profile that is not there is not.
    if (isOwn) {
      return renderFrame(
        <EmptyState
          icon="🧭"
          title="We could not load your profile"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void profileQuery.refetch()}
        />,
      )
    }

    return renderFrame(
      <EmptyState
        icon={status === 403 ? '🔒' : '🧭'}
        title={status === 403 ? 'This profile is not available.' : 'No profile found'}
        subtitle={
          status === 403
            ? 'You cannot view this explorer right now.'
            : 'This explorer has not set up their profile yet.'
        }
        actionLabel="Go back"
        onAction={() => navigation.goBack()}
      />,
    )
  }

  // `GET /profile` answers 200 with `data: null` before onboarding writes the
  // row — a state, not a failure, so it is not folded into the error branch.
  if (isOwn && profile === null) {
    return renderFrame(
      <EmptyState
        icon="🧳"
        title="No profile yet"
        subtitle="Finish setting up your explorer profile to appear on Stourify."
        {...(canOpen('EditProfile')
          ? { actionLabel: 'Set up profile', onAction: () => navigation.navigate('EditProfile') }
          : {})}
      />,
    )
  }

  const subjectName = profile?.name ?? profile?.username ?? 'this explorer'

  /**
   * The grid's own three outcomes — and they are the POSTS query's, not the
   * profile query's.
   *
   * This screen makes two requests, and until STOURIFY-87 only one of them told
   * the truth about failing. The profile query above got an honest failure
   * state with a retry in STOURIFY-82; the posts query said "You have not
   * posted yet." to somebody whose posts request had just timed out — a claim
   * about their posting history that nobody had checked.
   *
   * **The failure copy names the posts, deliberately.** The header above may
   * have loaded perfectly, and two whole-screen "we could not load this
   * profile" messages about one profile would read as two separate faults
   * rather than one partial load.
   *
   * **It lives inside `ListEmptyComponent`**, which only renders when the grid
   * has no tiles at all, so content always wins over an error. React Query
   * keeps serving posts it already holds while a later fetch fails; hoisting an
   * `isError` check above the `FlatList` would delete that protection and never
   * once show it had, because the branch is unreachable while online.
   * `FeedScreen.tsx:106-132` is the canonical write-up.
   *
   * **`isLoading` is asked before `isError`**, and its branch is deliberately
   * nothing at all: a first load renders the header with an empty grid under
   * it, which is quieter than skeleton tiles and is what this screen has always
   * done. `isError` then stays true through a retry until one succeeds, holding
   * the failure message up rather than flickering to the empty message.
   */
  const emptyGrid = postsQuery.isLoading ? null : postsQuery.isError ? (
    <EmptyState
      icon="📡"
      title="Couldn't load the posts"
      subtitle="We couldn't reach Stourify just now. Check your connection and try again."
      actionLabel="Try again"
      onAction={() => void postsQuery.refetch()}
    />
  ) : (
    <EmptyState
      icon="📷"
      title={isOwn ? 'You have not posted yet.' : 'No posts to show.'}
    />
  )

  return renderFrame(
    <>
    <FlatList
      testID="profile-grid"
      data={posts}
      keyExtractor={(post) => post.uuid}
      renderItem={renderTile}
      numColumns={COLUMNS}
      columnWrapperStyle={{ gap: GRID_GAP }}
      ListHeaderComponent={
        <ProfileHeader
          profile={profile}
          // `profile.name` first for BOTH cases. Falling back to the username
          // renders it twice — once as the name and once as the handle — which
          // is what the header did before the server sent a name at all.
          displayName={profile?.name ?? (isOwn ? currentUser?.name : undefined) ?? ''}
          avatarUri={isOwn ? currentUser?.avatar : undefined}
          isOwn={isOwn}
          canOpen={canOpen}
          onEdit={() => navigation.navigate('EditProfile')}
          onSettings={() => navigation.navigate('Settings')}
          onFollowers={() => navigation.navigate('FollowList', { userId: targetId, type: 'followers' })}
          onFollowing={() => navigation.navigate('FollowList', { userId: targetId, type: 'following' })}
          onFollowToggle={() =>
            viewer?.follow_uuid ? unfollowMutation.mutate() : followMutation.mutate()
          }
          followPending={followMutation.isPending || unfollowMutation.isPending}
          onMore={() => setMenuOpen(true)}
        />
      }
      ListEmptyComponent={emptyGrid}
    />

    {/* The overflow menu. Unblock is deliberately absent: once a block stands,
        this screen cannot be reached at all — `GET /profiles/{them}` answers 403
        for the blocker exactly as it does for the blocked party, because a
        different answer would announce the block (STOURIFY-36). Unblock lives on
        the Blocked accounts list, which `GET /blocks` can always serve. */}
    <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
      <SheetOption
        label="Block"
        icon="🚫"
        destructive
        description="You will not see each other on Stourify."
        onPress={() => {
          setMenuOpen(false)
          setConfirmingBlock(true)
        }}
      />
      <SheetOption
        label="Report"
        icon="🚩"
        description="Tell our team about this explorer. They will not know."
        onPress={() => {
          setMenuOpen(false)
          setReporting(true)
        }}
      />
    </Sheet>

    {/* Confirmed rather than one-tap, because part of a block does not come
        back. `BlockApiController` hard-deletes the follow edges in both
        directions and `destroy()` states that unblocking will not recreate
        them — re-following on somebody's behalf would be worse. So the
        consequence is named here, in the words a person would use. */}
    <Sheet
      visible={confirmingBlock}
      onClose={() => setConfirmingBlock(false)}
      title={`Block ${subjectName}?`}
      subtitle={
        'Neither of you will see the other on Stourify, and any follows between you are removed. ' +
        'They are not told. If you unblock later, those follows will not be restored — you would each have to follow again.'
      }
    >
      {blockMutation.isError ? (
        <Text variant="caption" color="danger">
          {extractApiError(blockMutation.error)}
        </Text>
      ) : null}

      <Button
        label="Block"
        accessibilityLabel="Block this explorer"
        variant="danger"
        loading={blockMutation.isPending}
        onPress={() => blockMutation.mutate()}
      />
      <Button
        label="Cancel"
        accessibilityLabel="Cancel"
        variant="ghost"
        onPress={() => setConfirmingBlock(false)}
      />
    </Sheet>

    <ReportSheet
      visible={reporting}
      onClose={() => setReporting(false)}
      reportableType="user"
      reportableUuid={targetId}
    />
    </>,
  )
}

interface HeaderProps {
  profile: ExplorerProfile | null
  displayName: string
  avatarUri?: string
  isOwn: boolean
  canOpen: (name: string) => boolean
  onEdit: () => void
  onSettings: () => void
  onFollowers: () => void
  onFollowing: () => void
  onFollowToggle: () => void
  followPending: boolean
  /** Opens the block/report menu. Only ever called on somebody else's profile. */
  onMore: () => void
}

/**
 * The identity header.
 *
 * The AFFORDANCE SLOT that stood here is filled: block and report live in
 * `ProfileActions` below, in the `else` branch beside the follow button
 * (STOURIFY-37).
 *
 * One thing that note got wrong, worth recording because it looks right. It
 * said to gate the two actions on `profile.can`. That map comes from
 * `BaseResource::resolvePermissions()`, which resolves `view` / `update` /
 * `delete` **against the ExplorerProfile row** — so `can.update` is true only
 * for the profile's owner, and gating Block on it would show the button on the
 * one profile where blocking is meaningless and hide it everywhere it matters.
 * The abilities that really govern these two (`stourify.follows.manage`,
 * `stourify.reports.create`) are held by every explorer and are not reported
 * per target by any payload. So the gate is the `else` branch itself.
 */
function ProfileHeader({
  profile,
  displayName,
  avatarUri,
  isOwn,
  canOpen,
  onEdit,
  onSettings,
  onFollowers,
  onFollowing,
  onFollowToggle,
  followPending,
  onMore,
}: HeaderProps) {
  const theme = useTheme()
  const counts = profile?.counts

  return (
    <View style={{ paddingHorizontal: theme.gutter, paddingTop: theme.spacing[4], gap: theme.spacing[3] }}>
      <View style={{ alignItems: 'center', gap: theme.spacing[2] }}>
        <Avatar uri={avatarUri} name={displayName || profile?.username} size={88} ringed />

        {displayName ? (
          <Text variant="h1" numberOfLines={1}>
            {displayName}
          </Text>
        ) : null}

        {profile?.username ? (
          <Text variant="caption" color="muted">
            @{profile.username}
          </Text>
        ) : null}

        {profile?.bio ? (
          <Text variant="body" color="muted" style={{ textAlign: 'center' }}>
            {profile.bio}
          </Text>
        ) : null}

        {profile?.home_city ? (
          <Text variant="caption" color="muted">
            📍 {profile.home_city.name}
          </Text>
        ) : null}
      </View>

      {profile?.interests?.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2], justifyContent: 'center' }}>
          {profile.interests.map((interest) => (
            <Chip key={interest} label={interest} />
          ))}
        </View>
      ) : null}

      {/* Counts come from the server's computed aggregates. They rendered as a
          literal "–" before STOURIFY-35 because the endpoint being read did not
          carry them at all. */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', paddingVertical: theme.spacing[3] }}>
        <CountStat label="Spots" value={counts?.spots ?? 0} />
        <CountStat
          label="Followers"
          value={counts?.followers ?? 0}
          onPress={canOpen('FollowList') ? onFollowers : undefined}
        />
        <CountStat
          label="Following"
          value={counts?.following ?? 0}
          onPress={canOpen('FollowList') ? onFollowing : undefined}
        />
      </View>

      <ProfileActions
        profile={profile}
        isOwn={isOwn}
        canOpen={canOpen}
        onEdit={onEdit}
        onSettings={onSettings}
        onFollowToggle={onFollowToggle}
        followPending={followPending}
        onMore={onMore}
      />

      <Divider />
    </View>
  )
}

interface ActionsProps {
  profile: ExplorerProfile | null
  isOwn: boolean
  canOpen: (name: string) => boolean
  onEdit: () => void
  onSettings: () => void
  onFollowToggle: () => void
  followPending: boolean
  onMore: () => void
}

/**
 * The action row under the header — Follow, and beside it the overflow that
 * carries Block and Report (STOURIFY-37).
 */
function ProfileActions({
  profile,
  isOwn,
  canOpen,
  onEdit,
  onSettings,
  onFollowToggle,
  followPending,
  onMore,
}: ActionsProps) {
  const theme = useTheme()

  if (isOwn) {
    return (
      <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
        {canOpen('EditProfile') ? (
          <Button label="Edit Profile" variant="secondary" onPress={onEdit} style={{ flex: 1 }} />
        ) : null}
        {canOpen('Settings') ? (
          <Button label="Settings" variant="secondary" onPress={onSettings} style={{ flex: 1 }} />
        ) : null}
      </View>
    )
  }

  // Three states, not two. A pending request to a private account is neither
  // following nor not-following, and rendering it as the latter would offer to
  // send a request that already exists.
  const status = profile?.viewer.follow_status
  const label = status === 'active' ? 'Following' : status === 'pending' ? 'Requested' : 'Follow'
  // The visible label names the STATE; the accessible label names what the tap
  // DOES. "Following" read aloud on a button sounds like it starts following.
  const action =
    status === 'active' ? 'Unfollow' : status === 'pending' ? 'Cancel follow request' : 'Follow'

  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
      <Button
        label={label}
        accessibilityLabel={action}
        variant={status === null || status === undefined ? 'primary' : 'secondary'}
        onPress={onFollowToggle}
        loading={followPending}
        style={{ flex: 1 }}
      />

      {/* Not a Button: the kit's Button is a labelled control and this is a
          glyph. The visible "⋯" says nothing to a screen reader, so the
          accessible label carries the whole meaning. */}
      <Pressable
        onPress={onMore}
        accessibilityRole="button"
        accessibilityLabel="More options"
        style={{
          minWidth: theme.minTouchTarget,
          minHeight: theme.minTouchTarget,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radius.button,
          borderWidth: 1,
          borderColor: theme.colors.hairline,
        }}
      >
        <Text variant="h2" color="muted">
          ⋯
        </Text>
      </Pressable>
    </View>
  )
}

function CountStat({ label, value, onPress }: { label: string; value: number; onPress?: () => void }) {
  const theme = useTheme()

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${value} ${label}` : undefined}
      style={{ alignItems: 'center', minWidth: theme.minTouchTarget }}
    >
      <Text variant="h2">{String(value)}</Text>
      <Text variant="caption" color="muted">
        {label}
      </Text>
    </Pressable>
  )
}
