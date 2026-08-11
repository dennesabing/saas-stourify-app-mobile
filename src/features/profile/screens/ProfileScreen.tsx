import { useCallback } from 'react'
import { Dimensions, FlatList, Image, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import { getMyProfile, getProfile, type ExplorerProfile } from '@/shared/api/profiles'
import { getPosts, getUserPosts } from '@/shared/api/posts'
import { follow, unfollow } from '@/shared/api/follows'
import { Avatar, Button, Chip, Divider, EmptyState, Skeleton, Text } from '@/shared/components/ui'
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
 * Three read outcomes are ordinary rather than exceptional, and each gets its
 * own render:
 *
 * - **`null` from `GET /profile`** — registered but mid-onboarding. Not an
 *   error; the profile row is written by the onboarding flow.
 * - **404** — that explorer never created a profile.
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

  return renderFrame(
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
        />
      }
      ListEmptyComponent={
        postsQuery.isLoading ? null : (
          <View style={{ padding: theme.spacing[7], alignItems: 'center' }}>
            <Text variant="body" color="muted">
              {isOwn ? 'You have not posted yet.' : 'No posts to show.'}
            </Text>
          </View>
        )
      }
    />,
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
}

/**
 * The identity header.
 *
 * ── AFFORDANCE SLOT ─────────────────────────────────────────────────────────
 * STOURIFY-37's block and report actions belong in `ProfileActions` below, in
 * the branch that renders for somebody ELSE's profile, beside the follow
 * button. Nothing else on this screen needs to change for them: the row is
 * already laid out for more than one control, and `profile.can` from
 * `ProfileResource` is the ability map to gate them on.
 * ────────────────────────────────────────────────────────────────────────────
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
}

/**
 * The action row under the header — and the place STOURIFY-37 hangs Block and
 * Report off, in the `else` branch beside the follow button.
 */
function ProfileActions({
  profile,
  isOwn,
  canOpen,
  onEdit,
  onSettings,
  onFollowToggle,
  followPending,
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
      {/* STOURIFY-37: Block and Report go here. */}
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
