/**
 * Navigation contract, shaped to the deck's information architecture:
 * Home · Discover · ⊕ Create · Activity · Profile.
 *
 * Community, Messaging, Business and Monetization are deferred past the beta
 * (`docs/mobile-delivery/technical-spec.md` §3) and get their own stacks then.
 */

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
  Comments: { postId: string }
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
  PostDetail: { postId: string }
  SpotDetail: { spotId: string }
  PhotoGallery: { spotId: string }
  Reviews: { spotId: string }
  WriteReview: { spotId: string }
  /** The M2c offline queue surface — reached from Settings. */
  SyncStatus: undefined
  /** Development-only: renders every primitive for visual review. */
  ThemeGallery: undefined
}
