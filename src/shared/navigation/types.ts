/**
 * Navigation contract, shaped to the deck's information architecture:
 * Home · Discover · ⊕ Create · Activity · Profile.
 *
 * Community, Messaging, Business and Monetization are deferred past the beta
 * (`docs/mobile-delivery/technical-spec.md` §3) and get their own stacks then.
 */

/**
 * What a comment thread is hanging off.
 *
 * One screen shows comments, and there are two kinds of thing worth commenting
 * on: a post, and a note somebody pinned to a spot's About corkboard. The
 * parameter carries one or the other and never both, so whichever key is
 * present is also the answer to which host it is — that is what makes it a
 * *discriminated* union, and it is why `CommentsScreen` needs no separate
 * "kind" field to look at.
 *
 * `postId` keeps its name rather than becoming a neutral `id`, because
 * `PostDetailScreen` already navigates with it and the post half of this route
 * is a contract several tests depend on (STOURIFY-148).
 */
export type CommentThreadTarget = { postId: string } | { spotAboutId: string }

export type RootStackParamList = {
  Welcome: undefined
  Login: undefined
  Register: undefined
  ForgotPassword: undefined
  /** `email` is prefilled from the Forgot-password step; the token is pasted (spec §6.2). */
  ResetPassword: { email?: string }
  Onboarding: undefined
  MainTabs: undefined
}

/**
 * Reached only right after registration, never after an ordinary login — see
 * `useOnboardingStore`. Each step has a visible Skip; `FollowSuggestions` is
 * the last step and finishing it (Skip or otherwise) marks onboarding
 * complete.
 */
export type OnboardingStackParamList = {
  Permissions: undefined
  Interests: undefined
  HomeCity: undefined
  FollowSuggestions: undefined
}

export type TabParamList = {
  HomeTab: undefined
  DiscoverTab: undefined
  CreateTab: undefined
  ActivityTab: undefined
  ProfileTab: undefined
}

/**
 * `Likes` was cut, not just left unregistered: `GET /api/v1/reactions`
 * (`ReactionController::index` / `respondWith()`) returns `{reacted, mine,
 * counts}` — reaction *counts*, never the reacting users. There is no
 * endpoint this screen could list from without fabricating data. Revisit if
 * a reactions-listing endpoint is ever added.
 */
export type HomeStackParamList = {
  Home: undefined
  PostDetail: { postId: string }
  /**
   * Reached by tapping the author of a post — in a feed row or on the detail
   * screen. Registered here as well as in Discover, Activity and Profile
   * because the feed is where an explorer meets most content, and until
   * STOURIFY-35 the Home stack had no profile route at all: the author was
   * named on every row and led nowhere.
   */
  Profile: { userId?: string }
  Comments: CommentThreadTarget
  SpotDetail: { spotId: string }
  PhotoGallery: { spotId: string }
  Reviews: { spotId: string }
  WriteReview: { spotId: string }
}

export type DiscoverStackParamList = {
  Discover: undefined
  Search: undefined
  Nearby: undefined
  Map: undefined
  /**
   * Reached from a people hit in Search. Registered here as well as in the
   * Activity and Profile stacks because `/discover/search` returns people, and
   * a person row that renders but goes nowhere leaves the people index exactly
   * as unreachable as it was before (STOURIFY-9).
   */
  Profile: { userId?: string }
  SpotDetail: { spotId: string }
  PostDetail: { postId: string }
  /**
   * Registered here, and on the Profile stack, because `SpotDetail` is — a
   * thread opened from a spot's About tab has to exist in whichever stack the
   * reader reached that spot through, and search is one of the three
   * (STOURIFY-148).
   */
  Comments: CommentThreadTarget
  PhotoGallery: { spotId: string }
  Reviews: { spotId: string }
  WriteReview: { spotId: string }
}

export type CreateStackParamList = {
  CreateMenu: undefined
  MediaPicker: undefined
  PostCompose: { mediaAssets: { uri: string; type?: string; fileName?: string }[] }
  SpotPicker: undefined
  /**
   * `undefined` on both of these is load-bearing, not laziness.
   *
   * The only payload a capture flow could pass is a camera or picker URI, and
   * that is an OS cache entry Android may reclaim (design spec §2.3 rule 4).
   * Capture writes a `pending_media` row before it navigates, so the review
   * step reads the database instead — and a param here would be the one way to
   * put a cache URI back into navigation state.
   */
  CameraCapture: undefined
  PhotoReview: undefined
  /** The offline-first slice: writes straight to WatermelonDB. */
  CreateSpot: undefined
  MySpots: undefined
  /**
   * The same queue screen the Profile stack registers, reachable a second way
   * on purpose (STOURIFY-118).
   *
   * Its Profile-stack home is behind a screen that fetches the profile and
   * renders an error wall when it cannot — so with no network, the one screen
   * written to reassure somebody their unsent work is safe was the one screen
   * they could not open. This stack starts at a menu that reads nothing from
   * the server, so it stays reachable with no network at all.
   */
  SyncStatus: undefined
}

export type ActivityStackParamList = {
  Activity: undefined
  PostDetail: { postId: string }
  Profile: { userId?: string }
}

export type ProfileStackParamList = {
  Profile: { userId?: string }
  FollowList: { userId: string; type: 'followers' | 'following' }
  EditProfile: undefined
  Wishlist: undefined
  Settings: undefined
  /**
   * The list of explorers I have blocked, reached from Settings.
   *
   * It is here and not on the other-user profile because a block hides that
   * profile from the blocker too — `GET /profiles/{user}` answers 403 in both
   * directions so the difference cannot announce the block (STOURIFY-36). This
   * is the only surface Unblock can be reached from (STOURIFY-37).
   */
  BlockedAccounts: undefined
  PostDetail: { postId: string }
  SpotDetail: { spotId: string }
  /** Reached from a spot's About tab — see the Discover stack's note. */
  Comments: CommentThreadTarget
  PhotoGallery: { spotId: string }
  Reviews: { spotId: string }
  WriteReview: { spotId: string }
  /** The M2c offline queue surface — reached from Settings. */
  SyncStatus: undefined
  /** Development-only: renders every primitive for visual review. */
  ThemeGallery: undefined
}
