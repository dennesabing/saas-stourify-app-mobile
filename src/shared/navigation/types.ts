/**
 * Navigation contract, shaped to the deck's information architecture:
 * Home · Discover · ⊕ Create · Activity · Profile.
 *
 * Community, Messaging, Business and Monetization are deferred past the beta
 * (`docs/mobile-delivery/technical-spec.md` §3) and get their own stacks then.
 */

export type RootStackParamList = {
  Login: undefined
  Register: undefined
  ForgotPassword: undefined
  VerifyEmail: { email: string }
  Onboarding: undefined
  MainTabs: undefined
}

export type TabParamList = {
  HomeTab: undefined
  DiscoverTab: undefined
  CreateTab: undefined
  ActivityTab: undefined
  ProfileTab: undefined
}

export type HomeStackParamList = {
  Home: undefined
  PostDetail: { postId: string }
  Comments: { postId: string }
  Likes: { postId: string }
  SpotDetail: { spotId: string }
}

export type DiscoverStackParamList = {
  Discover: undefined
  Search: undefined
  Nearby: undefined
  Map: undefined
  SpotDetail: { spotId: string }
  PostDetail: { postId: string }
}

export type CreateStackParamList = {
  CreateMenu: undefined
  MediaPicker: undefined
  PostCompose: { mediaAssets: { uri: string; type?: string; fileName?: string }[] }
  SpotPicker: undefined
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
  /** The M2c offline queue surface — reached from Settings. */
  SyncStatus: undefined
  /** Development-only: renders every primitive for visual review. */
  ThemeGallery: undefined
}
