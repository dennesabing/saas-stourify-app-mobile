import { useCallback, useState } from 'react'
import { Dimensions, FlatList, Image, Linking, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { describeRequestFailure } from '@/shared/api/errorMessage'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import { getMyProfile, getProfile, type ExplorerProfile } from '@/shared/api/profiles'
import { getPosts, getUserPosts } from '@/shared/api/posts'
import { follow, unfollow } from '@/shared/api/follows'
import { blockUser } from '@/shared/api/blocks'
import { extractApiError } from '@/shared/api/client'
import ReportSheet from '@/features/social/components/ReportSheet'
import SavedSpotRow from '@/features/spots/components/SavedSpotRow'
import SavedSpotsNotice from '@/features/spots/components/SavedSpotsNotice'
import { useSavedSpots, type SavedSpot } from '@/features/spots/hooks/useSavedSpots'
import {
  Avatar,
  BackButton,
  Button,
  Chip,
  EmptyState,
  Icon,
  Sheet,
  SheetOption,
  Skeleton,
  Text,
  type IconName,
} from '@/shared/components/ui'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { useAuthStore } from '@/shared/store/auth'
import type { Post } from '@/shared/api/types'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<ProfileStackParamList, 'Profile'>

/** The two content tabs. Somebody else's profile only ever has the first. */
type ProfileTab = 'spots' | 'wishlist'

const COLUMNS = 3
/** The design's `.grid3` gap and padding, in points. */
const GRID_GAP = 4
const GRID_PADDING = 14
/** The design's round header buttons (`.cbtn`), the same size as `BackButton`. */
const DISC = 38

/**
 * The explorer identity surface — mine and anyone else's, one screen.
 *
 * Which profile it shows is decided by `route.params.userId`: absent (or my own
 * uuid) means mine. That single-screen shape is deliberate — the two differ
 * only in which endpoint feeds them and which action sits under the header, and
 * splitting them would duplicate the whole header for one button.
 *
 * **It is drawn from artboards 1 and 6 of `docs/design/Stourify - Profile.dc.html`**
 * (STOURIFY-288): a left-aligned header, the three numbers on a card, one
 * action button, and underline tabs over the content. What the canvas draws
 * that nothing backs is deliberately absent — the cover photo, Trails, Badges,
 * Message, Share and Mute. The card's `spec` names each and says why.
 *
 * **Two endpoints, and the distinction is not cosmetic** (STOURIFY-35). This
 * screen used to read `GET /users/{uuid}` — the boilerplate's platform-user
 * route — which carries a name, an email and an avatar and nothing else. There
 * is no username, bio, home city or follower count on it, which is why the
 * counts were hardcoded to a literal "–" and the Follow button always read
 * "Follow" no matter the relationship. The explorer identity lives on
 * `GET /profile` and `GET /profiles/{user}`.
 *
 * Five read outcomes are ordinary rather than exceptional, and each gets its
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
 * - **any other failure on somebody else's** — the request failed, which says
 *   nothing about the explorer. It says what went wrong and offers a retry
 *   (STOURIFY-278); it used to borrow the 404's "has not set up their profile".
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
  const canOpen = useCallback((name: string) => routeNames.includes(name), [routeNames])

  /**
   * A profile pushed from the feed, a search or a follower list has somewhere
   * to go back to, and artboard 6 draws the button for it. The Profile tab's
   * own root does not, so it gets none.
   *
   * **Asked as "am I the first screen in my own stack?"** — and the emulator
   * rejected two easier questions (STOURIFY-288's live run):
   *
   * - `navigation.canGoBack()` also asks the tab bar above the stack, and a
   *   tab bar that remembers you came from Home answers yes. The Profile tab's
   *   root drew a Back button that switched tabs instead of going back.
   * - The stack's `index` is right at the moment it is read, but reading it
   *   during render does not subscribe to it. Choosing Light in Settings
   *   re-rendered this screen while Settings sat on top (index 1), and popping
   *   Settings did not re-render it, so the stale Back button stayed.
   *
   * Whether this route is the stack's first never changes while the screen
   * exists, so a render at any moment gives the same, correct answer.
   */
  const canGoBack = (navigation.getState?.()?.routes?.[0]?.key ?? route.key) !== route.key

  const [tab, setTab] = useState<ProfileTab>('spots')
  // Only your own profile has a Wishlist; a stale 'wishlist' can never show on
  // somebody else's, whatever the state says.
  const activeTab: ProfileTab = isOwn ? tab : 'spots'

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

  /**
   * The Wishlist tab's list — the SAME source as the Saved spots screen, same
   * query key, so opening one after the other costs nothing (STOURIFY-288).
   * That includes the saves this phone has not sent yet (STOURIFY-207).
   *
   * It waits for the tab to be opened. Most visits to a profile never look at
   * the saves, and a request per visit for a list nobody asked to see is the
   * kind of cost an offline-first app should not pay by default.
   */
  const wishlistQuery = useSavedSpots({ enabled: isOwn && activeTab === 'wishlist' })

  /**
   * A save made on a spot page has to be here when you come back, and this
   * screen stays mounted between visits — the Saved spots screen's own rule
   * (STOURIFY-200), which the emulator showed this tab needed too: a spot
   * saved and reading "Saved" came back to "Nothing saved yet". Only while
   * the tab is showing; nobody pays for a list they are not looking at.
   */
  useRefetchOnFocus(navigation, () => {
    if (isOwn && activeTab === 'wishlist') void wishlistQuery.refetch()
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

  // ── My own menu (STOURIFY-288) ────────────────────────────────────────────
  const [ownMenuOpen, setOwnMenuOpen] = useState(false)

  /**
   * What sat on the page as buttons before the redesign, now behind the round
   * button at the top — the canvas's "more/settings menu". Only what the app
   * has: its "Offline downloads" and "Claim your business" rows are features
   * that do not exist.
   *
   * Each is gated exactly as the buttons were: this screen renders inside four
   * stacks, and navigating to a route a stack has not registered throws. When
   * none of them can be reached, the menu button is not drawn at all.
   */
  const ownMenu = (
    [
      { label: 'Settings', icon: '⚙️', route: 'Settings' },
      // Posts you started and did not share (STOURIFY-159).
      { label: 'Drafts', icon: '📝', route: 'Drafts' },
      { label: 'Offline & sync', icon: '🔄', route: 'SyncStatus' },
    ] as const
  ).filter((item) => canOpen(item.route))

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
  const tile = Math.floor((width - GRID_PADDING * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS)

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

  const renderSaved = useCallback(
    ({ item }: { item: SavedSpot }) => (
      <View style={{ paddingHorizontal: theme.gutter }}>
        <SavedSpotRow
          item={item}
          onOpenSpot={(spotId) => navigation.navigate('SpotDetail', { spotId })}
        />
      </View>
    ),
    [navigation, theme.gutter],
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
        <Skeleton height={92} width={92} />
        <Skeleton height={24} width="60%" />
        <Skeleton height={64} />
      </View>,
    )
  }

  const errorStatus = (profileQuery.error as { response?: { status?: number } })?.response?.status

  /**
   * A `403` or a `404` is the SERVER'S VERDICT; anything else is a bad line.
   *
   * The difference decides whether a copy already in the cache may be shown.
   * `GET /profiles/{them}` answers 403 to the blocker and the blocked party
   * identically, by design (STOURIFY-36) — so serving that explorer back out of
   * the cache would quietly undo a block. A 404 is the same kind of answer: the
   * profile is gone, not unreachable. Neither is fixed by waiting for signal,
   * so neither may be papered over with an old copy.
   */
  const serverRefused = errorStatus === 403 || errorStatus === 404

  /**
   * Showing a saved copy because the refresh failed — the offline state
   * (STOURIFY-120).
   *
   * `queryClient.ts` writes every finished query to the device and reads it
   * back on the next start, so after a cold start with no signal the profile is
   * usually already in hand. This screen used to throw it away: it asked
   * `isError` before it asked whether it held any data, and painted an error
   * wall over a perfectly good profile. Behind that wall sat Settings, and
   * behind Settings sat Blocked accounts and Offline & sync — so one failed
   * request put every offline-usable screen out of reach (STOURIFY-118 found
   * this and routed around it from the Create menu; this is the door itself).
   *
   * It is the rule the posts grid below has followed since STOURIFY-87 —
   * content beats an error — arriving at the header, which never got it.
   */
  const showingSavedCopy = profileQuery.isError && profile !== null && !serverRefused

  if (profileQuery.isError && (profile === null || serverRefused)) {
    const status = errorStatus

    // Your own profile failing to load and a stranger's not existing are
    // different facts, and until STOURIFY-82 they shared one message. A newly
    // registered user tapping Profile was told "This explorer has not set up
    // their profile yet" — third person, about themselves — with *Go back* as
    // the only control, which is not a way out of anything. A read that failed
    // is worth retrying; a profile that is not there is not.
    if (isOwn) {
      /**
       * The explanation under the headline comes from the failure that actually
       * happened (STOURIFY-249, following STOURIFY-225). It used to tell
       * everybody to check their connection, including somebody the server had
       * answered with a 403.
       *
       * The headline stays this screen's own rather than the helper's
       * "Couldn't load your profile": it is true whatever went wrong, and the
       * tests assert its absence by this exact wording elsewhere.
       */
      const failure = describeRequestFailure(profileQuery.error, 'your profile')

      return renderFrame(
        <EmptyState
          icon={failure.icon}
          title="We could not load your profile"
          subtitle={failure.subtitle}
          actionLabel="Try again"
          onAction={() => void profileQuery.refetch()}
          // The way out when there is genuinely nothing saved to show — a first
          // run with no signal, or a copy that has aged past the cache's 24
          // hours. Settings needs no network, and Blocked accounts and Offline
          // & sync are behind it. Gated on the stack actually registering the
          // route, exactly like the menu in the header below: this screen is
          // also pushed onto Home, Discover and Activity, none of which carry
          // Settings, and navigating to a route a stack does not have throws.
          {...(canOpen('Settings')
            ? {
                secondaryActionLabel: 'Settings',
                onSecondaryAction: () => navigation.navigate('Settings'),
              }
            : {})}
        />,
      )
    }

    // A block. The server's wording is identical from either side (STOURIFY-36),
    // so this stays in the screen's own words rather than the helper's refusal
    // sentence, which is a different claim.
    if (status === 403) {
      return renderFrame(
        <EmptyState
          icon="🔒"
          title="This profile is not available."
          subtitle="You cannot view this explorer right now."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />,
      )
    }

    // The server said this explorer has no profile — a verdict, so nothing to retry.
    if (status === 404) {
      return renderFrame(
        <EmptyState
          icon="🧭"
          title="No profile found"
          subtitle="This explorer has not set up their profile yet."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />,
      )
    }

    /**
     * Anything else is a request that failed, not an answer about the explorer
     * (STOURIFY-278). It used to fall into the 404 wording above, so a dropped
     * connection told the reader this person had never set up a profile — a
     * claim nobody had checked. It says what actually happened and offers a
     * retry; Go back stays beside it for a reader who does not want to wait.
     */
    const failure = describeRequestFailure(profileQuery.error, 'this profile')

    return renderFrame(
      <EmptyState
        icon={failure.icon}
        title={failure.title}
        subtitle={failure.subtitle}
        actionLabel="Try again"
        onAction={() => void profileQuery.refetch()}
        secondaryActionLabel="Go back"
        onSecondaryAction={() => navigation.goBack()}
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
   *
   * **The words come from the failure that actually happened** (STOURIFY-249,
   * following STOURIFY-225). The grid used to tell everybody to check their
   * connection, including somebody the server had answered with a 403. Only the
   * wording moved; the branch deciding WHETHER to show a failure is unchanged.
   */
  const postsFailure = describeRequestFailure(postsQuery.error, 'the posts')
  const emptyGrid = postsQuery.isLoading ? null : postsQuery.isError ? (
    <EmptyState
      icon={postsFailure.icon}
      title={postsFailure.title}
      subtitle={postsFailure.subtitle}
      actionLabel="Try again"
      onAction={() => void postsQuery.refetch()}
    />
  ) : (
    <EmptyState icon="📷" title={isOwn ? 'You have not posted yet.' : 'No posts to show.'} />
  )

  /**
   * The Wishlist tab's empty states, in the Saved spots screen's own words
   * (STOURIFY-280) — the same three situations with the same remedies, because
   * it is the same list. A reader told "you have saved nothing" when the
   * request actually failed goes away believing their saves were lost.
   */
  const wishlistFailure = describeRequestFailure(wishlistQuery.error, 'your saved spots')
  const emptyWishlist = wishlistQuery.isPending ? (
    <EmptyState icon="🔖" title="Loading your saved spots…" />
  ) : wishlistQuery.isError ? (
    <EmptyState
      icon={wishlistFailure.icon}
      title={wishlistFailure.title}
      subtitle={wishlistFailure.subtitle}
      actionLabel="Try again"
      onAction={() => void wishlistQuery.refetch()}
    />
  ) : (
    <EmptyState
      icon="🔖"
      title="Nothing saved yet"
      subtitle="Tap the heart on any spot and it will show up here."
    />
  )

  const header = (
    <ProfileHeader
      profile={profile}
      isStale={showingSavedCopy}
      // `profile.name` first for BOTH cases. Falling back to the username
      // renders it twice — once as the name and once as the handle — which
      // is what the header did before the server sent a name at all.
      displayName={profile?.name ?? (isOwn ? currentUser?.name : undefined) ?? ''}
      // The profile's own photo first, for everyone. Login never sends one,
      // so the signed-in user's `avatar` is only an instant copy left by an
      // upload on this phone — it is gone after the next sign-in, and it was
      // never there for anybody else's header (STOURIFY-307).
      avatarUri={profile?.avatar_url ?? (isOwn ? currentUser?.avatar : undefined)}
      isOwn={isOwn}
      canOpen={canOpen}
      onEdit={() => navigation.navigate('EditProfile')}
      onFollowers={() => navigation.navigate('FollowList', { userId: targetId, type: 'followers' })}
      onFollowing={() => navigation.navigate('FollowList', { userId: targetId, type: 'following' })}
      onFollowToggle={() =>
        viewer?.follow_uuid ? unfollowMutation.mutate() : followMutation.mutate()
      }
      followPending={followMutation.isPending || unfollowMutation.isPending}
      tab={activeTab}
      onTab={setTab}
    />
  )

  // The menu button's place in the top bar. Mine opens my own menu; theirs
  // opens Block and Report (STOURIFY-37), as the canvas draws both.
  const menuButton = isOwn ? (
    ownMenu.length > 0 ? (
      <DiscButton icon="settings" label="Profile menu" onPress={() => setOwnMenuOpen(true)} />
    ) : null
  ) : (
    <DiscButton icon="more" label="More options" onPress={() => setMenuOpen(true)} />
  )

  return renderFrame(
    <>
      {canGoBack || menuButton ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: GRID_PADDING,
            paddingTop: theme.spacing[1],
            paddingBottom: theme.spacing[1],
          }}
        >
          {canGoBack ? <BackButton onPress={() => navigation.goBack()} /> : <View />}
          {menuButton}
        </View>
      ) : null}

      {/*
        One list per tab, keyed so the swap is a fresh list. React Native cannot
        change `numColumns` on a list that is already on screen — it throws —
        and the grid is three columns while the saved spots are one.
      */}
      {activeTab === 'wishlist' ? (
        <FlatList
          key="wishlist"
          testID="profile-wishlist"
          data={wishlistQuery.items}
          keyExtractor={(item) => item.key}
          renderItem={renderSaved}
          ListHeaderComponent={
            <>
              {header}
              {/*
                The only way into the Wishlist screen (STOURIFY-289). This tab
                replaced the "Saved spots" button in STOURIFY-288, which left
                the screen with no door. Gated like every other route here,
                because this screen also renders inside stacks without it.
              */}
              {canOpen('Wishlist') && wishlistQuery.items.length > 0 ? (
                <Pressable
                  onPress={() => navigation.navigate('Wishlist')}
                  accessibilityRole="button"
                  hitSlop={theme.spacing[2]}
                  style={{
                    alignSelf: 'flex-end',
                    paddingHorizontal: theme.gutter,
                    paddingBottom: theme.spacing[3],
                  }}
                >
                  <Text variant="caption" color="primary">
                    See all
                  </Text>
                </Pressable>
              ) : null}
              {/* Only the phone's unsent saves are showing: say what is
                  missing, as the Wishlist screen does (STOURIFY-207). */}
              <SavedSpotsNotice
                rest={wishlistQuery.rest}
                onRetry={() => void wishlistQuery.refetch()}
              />
            </>
          }
          ListEmptyComponent={emptyWishlist}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing[3] }} />}
          contentContainerStyle={{ paddingBottom: theme.spacing[6] }}
        />
      ) : (
        <FlatList
          key="spots"
          testID="profile-grid"
          data={posts}
          keyExtractor={(post) => post.uuid}
          renderItem={renderTile}
          numColumns={COLUMNS}
          columnWrapperStyle={{ gap: GRID_GAP, paddingHorizontal: GRID_PADDING }}
          ListHeaderComponent={header}
          ListEmptyComponent={emptyGrid}
        />
      )}

      <Sheet visible={ownMenuOpen} onClose={() => setOwnMenuOpen(false)}>
        {ownMenu.map((item) => (
          <SheetOption
            key={item.route}
            label={item.label}
            icon={item.icon}
            onPress={() => {
              setOwnMenuOpen(false)
              navigation.navigate(item.route)
            }}
          />
        ))}
      </Sheet>

      {/* The overflow menu. Unblock is deliberately absent: once a block stands,
        this screen cannot be reached at all — `GET /profiles/{them}` answers 403
        for the blocker exactly as it does for the blocked party, because a
        different answer would announce the block (STOURIFY-36). Unblock lives on
        the Blocked accounts list, which `GET /blocks` can always serve. Report
        comes first, as the canvas orders them; its "Share profile" and "Mute
        notifications" rows are not built, because nothing backs either. */}
      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <SheetOption
          label="Report"
          icon="🚩"
          description="Tell our team about this explorer. They will not know."
          onPress={() => {
            setMenuOpen(false)
            setReporting(true)
          }}
        />
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

/**
 * A round header button — the canvas's `.cbtn`. Drawn like `BackButton`, the
 * disc beside it, so the two read as one pair of controls.
 *
 * The glyph is decorative (`Icon` hides itself from screen readers); the
 * accessible label carries the whole meaning.
 */
function DiscButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName
  label: string
  onPress: () => void
}) {
  const theme = useTheme()
  const slop = (theme.minTouchTarget - DISC) / 2

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={slop}
      style={({ pressed }) => ({
        width: DISC,
        height: DISC,
        borderRadius: DISC / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceAlt,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon name={icon} size={18} />
    </Pressable>
  )
}

/**
 * The address a person typed, made into one the phone can open. People write
 * `alexrivera.co`, not `https://alexrivera.co`, and a bare host is not a URL.
 */
function websiteUrl(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`
}

/** The address as people read it — no scheme, no trailing slash. */
function websiteLabel(website: string): string {
  return website.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

interface HeaderProps {
  profile: ExplorerProfile | null
  /** The refresh failed and this is the copy saved on the device. */
  isStale: boolean
  displayName: string
  avatarUri?: string
  isOwn: boolean
  canOpen: (name: string) => boolean
  onEdit: () => void
  onFollowers: () => void
  onFollowing: () => void
  onFollowToggle: () => void
  followPending: boolean
  tab: ProfileTab
  onTab: (tab: ProfileTab) => void
}

/**
 * The identity header — artboards 1 and 6 from the avatar down to the tabs.
 *
 * Left-aligned, as the canvas draws it. The canvas hangs the avatar over a
 * cover photo; a profile has no cover field, so the header starts at the avatar
 * rather than under a grey band that would read as an image that failed to
 * load (STOURIFY-264 trained reviewers to see grey as broken).
 *
 * Block and report are NOT gated on `profile.can`, and the reason is worth
 * keeping because it looks right. That map comes from
 * `BaseResource::resolvePermissions()`, which resolves `view` / `update` /
 * `delete` **against the ExplorerProfile row** — so `can.update` is true only
 * for the profile's owner, and gating Block on it would show the button on the
 * one profile where blocking is meaningless and hide it everywhere it matters.
 * The abilities that really govern these two (`stourify.follows.manage`,
 * `stourify.reports.create`) are held by every explorer and are not reported
 * per target by any payload. So the gate is `isOwn` itself.
 */
function ProfileHeader({
  profile,
  isStale,
  displayName,
  avatarUri,
  isOwn,
  canOpen,
  onEdit,
  onFollowers,
  onFollowing,
  onFollowToggle,
  followPending,
  tab,
  onTab,
}: HeaderProps) {
  const theme = useTheme()
  const counts = profile?.counts
  const website = profile?.website

  return (
    <View style={{ gap: theme.spacing[4], paddingTop: theme.spacing[2] }}>
      {/*
        Said out loud rather than left to be inferred. Showing a saved copy in
        silence is the quiet lie an offline app cannot afford: a follower count
        or a bio presented as current by an app that has just failed to check
        it. One muted line is the whole message — it is not dismissible,
        because the screen refreshes itself the moment the network is back and
        a control that can be dismissed is one that has to remember it was.
      */}
      {isStale ? (
        <Text
          variant="caption"
          color="muted"
          style={{ textAlign: 'center', paddingHorizontal: theme.gutter }}
        >
          Saved on this device — we could not refresh it just now, so it may be out of date.
        </Text>
      ) : null}

      <View style={{ paddingHorizontal: theme.gutter, gap: theme.spacing[1] }}>
        <Avatar uri={avatarUri} name={displayName || profile?.username} size={92} />

        {displayName ? (
          <Text variant="h1" numberOfLines={2} style={{ marginTop: theme.spacing[2] }}>
            {displayName}
          </Text>
        ) : null}

        {/*
          "@username · home city" — two pieces on one line rather than one
          string, so the handle stays a thing of its own for a screen reader
          and for every test that finds the profile by it.
        */}
        {profile?.username ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[1] }}>
            <Text variant="caption" color="muted">
              @{profile.username}
            </Text>
            {profile.home_city ? (
              <>
                <Text variant="caption" color="muted">
                  ·
                </Text>
                <Text variant="caption" color="muted">
                  {profile.home_city.name}
                </Text>
              </>
            ) : null}
          </View>
        ) : null}

        {profile?.bio ? (
          <Text variant="body" style={{ marginTop: theme.spacing[2] }}>
            {profile.bio}
          </Text>
        ) : null}

        {website ? (
          <Pressable
            onPress={() => void Linking.openURL(websiteUrl(website)).catch(() => {})}
            accessibilityRole="link"
            accessibilityHint="Opens in your browser"
            hitSlop={theme.spacing[2]}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              alignSelf: 'flex-start',
              marginTop: theme.spacing[1],
            }}
          >
            <Icon name="link" size={15} color="primary" />
            <Text
              variant="caption"
              color="primary"
              style={{ fontFamily: theme.fontFamily.bodySemiBold }}
            >
              {websiteLabel(website)}
            </Text>
          </Pressable>
        ) : null}

        {profile?.interests?.length ? (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: theme.spacing[2],
              marginTop: theme.spacing[2],
            }}
          >
            {profile.interests.map((interest) => (
              <Chip key={interest} label={interest} />
            ))}
          </View>
        ) : null}
      </View>

      {/* Counts come from the server's computed aggregates. They rendered as a
          literal "–" before STOURIFY-35 because the endpoint being read did not
          carry them at all. The card and the hairlines between the three are
          the canvas's `.pf-stats`. */}
      <View
        style={{
          flexDirection: 'row',
          marginHorizontal: theme.gutter,
          paddingVertical: theme.spacing[3],
          borderRadius: theme.radius.card,
          borderWidth: 1,
          borderColor: theme.colors.hairline,
          backgroundColor: theme.colors.card,
        }}
      >
        <CountStat label="Spots" value={counts?.spots ?? 0} />
        <StatDivider />
        <CountStat
          label="Followers"
          value={counts?.followers ?? 0}
          onPress={canOpen('FollowList') ? onFollowers : undefined}
        />
        <StatDivider />
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
        onFollowToggle={onFollowToggle}
        followPending={followPending}
      />

      <ProfileTabs isOwn={isOwn} value={tab} onChange={onTab} />
    </View>
  )
}

interface ActionsProps {
  profile: ExplorerProfile | null
  isOwn: boolean
  canOpen: (name: string) => boolean
  onEdit: () => void
  onFollowToggle: () => void
  followPending: boolean
}

/**
 * The one action under the header — Edit profile on mine, Follow on theirs.
 *
 * The canvas draws a second button beside each (Share on mine, Message on
 * theirs) and nothing backs either, so each button gets the whole row. That is
 * also what ends "Edit Profi…" (STOURIFY-269): three buttons sharing a 360dp
 * row left each too narrow for its label.
 */
function ProfileActions({
  profile,
  isOwn,
  canOpen,
  onEdit,
  onFollowToggle,
  followPending,
}: ActionsProps) {
  const theme = useTheme()

  if (isOwn) {
    // Guarded like everything else that navigates: this renders inside four
    // stacks, and only the Profile stack registers EditProfile.
    return canOpen('EditProfile') ? (
      <View style={{ paddingHorizontal: theme.gutter }}>
        <Button label="Edit profile" onPress={onEdit} fullWidth />
      </View>
    ) : null
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
    <View style={{ paddingHorizontal: theme.gutter }}>
      <Button
        label={label}
        accessibilityLabel={action}
        variant={status === null || status === undefined ? 'primary' : 'secondary'}
        onPress={onFollowToggle}
        loading={followPending}
        fullWidth
      />
    </View>
  )
}

/**
 * The content tabs — the canvas's `.pf-tabs`: an icon and a label each, the
 * chosen one in azure with an azure line under it.
 *
 * Not `SegmentedControl`. That draws a grey track with a raised white segment,
 * which is the Search results switch; the canvas draws this one as underline
 * tabs, and a reader tells the two apart by exactly that difference.
 *
 * Somebody else's profile has one tab. The canvas gives it a second, "Trails ·
 * 12", and there are no trails; a single tab still names what the grid below
 * it is.
 */
function ProfileTabs({
  isOwn,
  value,
  onChange,
}: {
  isOwn: boolean
  value: ProfileTab
  onChange: (tab: ProfileTab) => void
}) {
  const theme = useTheme()
  const tabs: { key: ProfileTab; label: string; icon: IconName }[] = isOwn
    ? [
        { key: 'spots', label: 'Spots', icon: 'grid' },
        { key: 'wishlist', label: 'Wishlist', icon: 'bookmark' },
      ]
    : [{ key: 'spots', label: 'Spots', icon: 'grid' }]

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        paddingHorizontal: GRID_PADDING,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.hairline,
        marginBottom: GRID_PADDING - GRID_GAP,
      }}
    >
      {tabs.map((t) => {
        const selected = t.key === value

        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={t.label}
            style={{
              flex: 1,
              minHeight: theme.minTouchTarget,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              borderBottomWidth: 2,
              borderBottomColor: selected ? theme.colors.primary : 'transparent',
              marginBottom: -1,
            }}
          >
            <Icon name={t.icon} size={16} color={selected ? 'primary' : 'muted'} />
            <Text
              variant="caption"
              color={selected ? 'primary' : 'muted'}
              style={{ fontFamily: theme.fontFamily.bodySemiBold }}
            >
              {t.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** The hairline between two numbers on the stats card, inset top and bottom. */
function StatDivider() {
  const theme = useTheme()

  return (
    <View
      style={{ width: 1, marginVertical: 6, backgroundColor: theme.colors.hairline }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  )
}

function CountStat({
  label,
  value,
  onPress,
}: {
  label: string
  value: number
  onPress?: () => void
}) {
  const theme = useTheme()

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${value} ${label}` : undefined}
      style={{ flex: 1, alignItems: 'center', minHeight: theme.minTouchTarget }}
    >
      <Text variant="h2" style={{ fontFamily: theme.fontFamily.displayBold }}>
        {String(value)}
      </Text>
      <Text variant="micro" color="muted">
        {label}
      </Text>
    </Pressable>
  )
}
