export type RootStackParamList = {
  Login: undefined
  Register: undefined
  MainTabs: undefined
}

export type FeedStackParamList = {
  Feed: undefined
  PostDetail: { postId: string }
}

export type NearbyStackParamList = {
  Nearby: undefined
  SpotDetail: { spotId: string }
  PostDetail: { postId: string }
}

export type SearchStackParamList = {
  Search: undefined
  SpotDetail: { spotId: string }
  PostDetail: { postId: string }
}

export type CreateStackParamList = {
  MediaPicker: undefined
  PostCompose: { mediaAssets: { uri: string; type?: string; fileName?: string }[] }
  SpotPicker: undefined
}

export type ProfileStackParamList = {
  Profile: { userId?: string }
  FollowList: { userId: string; type: 'followers' | 'following' }
  EditProfile: undefined
  Settings: undefined
  PostDetail: { postId: string }
}
