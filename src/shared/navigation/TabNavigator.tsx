import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import ActivityScreen from '@/features/activity/screens/ActivityScreen'
import CreateMenuScreen from '@/features/create/screens/CreateMenuScreen'
import CreateSpotScreen from '@/features/create/screens/CreateSpotScreen'
import ThemeGalleryScreen from '@/features/dev/screens/ThemeGalleryScreen'
import DiscoverScreen from '@/features/discover/screens/DiscoverScreen'
import MapScreen from '@/features/discover/screens/MapScreen'
import CommentsScreen from '@/features/feed/screens/CommentsScreen'
import FeedScreen from '@/features/feed/screens/FeedScreen'
import PostDetailScreen from '@/features/feed/screens/PostDetailScreen'
import CameraCaptureScreen from '@/features/media/screens/CameraCaptureScreen'
import PhotoReviewScreen from '@/features/media/screens/PhotoReviewScreen'
import NearbyScreen from '@/features/nearby/screens/NearbyScreen'
import EditProfileScreen from '@/features/profile/screens/EditProfileScreen'
import FollowListScreen from '@/features/profile/screens/FollowListScreen'
import ProfileScreen from '@/features/profile/screens/ProfileScreen'
import SettingsScreen from '@/features/profile/screens/SettingsScreen'
import BlockedAccountsScreen from '@/features/profile/screens/BlockedAccountsScreen'
import ReviewsScreen from '@/features/reviews/screens/ReviewsScreen'
import WriteReviewScreen from '@/features/reviews/screens/WriteReviewScreen'
import SearchScreen from '@/features/search/screens/SearchScreen'
import MediaPickerScreen from '@/features/social/screens/MediaPickerScreen'
import PostComposeScreen from '@/features/social/screens/PostComposeScreen'
import SpotPickerScreen from '@/features/social/screens/SpotPickerScreen'
import MySpotsScreen from '@/features/spots/screens/MySpotsScreen'
import PhotoGalleryScreen from '@/features/spots/screens/PhotoGalleryScreen'
import SpotDetailScreen from '@/features/spots/screens/SpotDetailScreen'
import SyncStatusScreen from '@/features/sync/screens/SyncStatusScreen'
import TabBar from './TabBar'
import type {
  ActivityStackParamList,
  CreateStackParamList,
  DiscoverStackParamList,
  HomeStackParamList,
  ProfileStackParamList,
  TabParamList,
} from './types'

const Tab = createBottomTabNavigator<TabParamList>()
const HomeStack = createNativeStackNavigator<HomeStackParamList>()
const DiscoverStack = createNativeStackNavigator<DiscoverStackParamList>()
const CreateStack = createNativeStackNavigator<CreateStackParamList>()
const ActivityStack = createNativeStackNavigator<ActivityStackParamList>()
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>()

// Stacked screens use back headers; the top-level screen of each tab renders
// its own header, matching the deck.
const stackOptions = { headerShown: false } as const

function HomeStackNav() {
  return (
    <HomeStack.Navigator screenOptions={stackOptions}>
      <HomeStack.Screen name="Home" component={FeedScreen} />
      <HomeStack.Screen name="PostDetail" component={PostDetailScreen} />
      <HomeStack.Screen name="Profile" component={ProfileScreen} />
      <HomeStack.Screen name="Comments" component={CommentsScreen} />
      <HomeStack.Screen name="SpotDetail" component={SpotDetailScreen} />
      <HomeStack.Screen name="PhotoGallery" component={PhotoGalleryScreen} />
      <HomeStack.Screen name="Reviews" component={ReviewsScreen} />
      <HomeStack.Screen name="WriteReview" component={WriteReviewScreen} />
    </HomeStack.Navigator>
  )
}

function DiscoverStackNav() {
  return (
    <DiscoverStack.Navigator screenOptions={stackOptions}>
      <DiscoverStack.Screen name="Discover" component={DiscoverScreen} />
      <DiscoverStack.Screen name="Search" component={SearchScreen} />
      <DiscoverStack.Screen name="Nearby" component={NearbyScreen} />
      <DiscoverStack.Screen name="Map" component={MapScreen} />
      <DiscoverStack.Screen name="Profile" component={ProfileScreen} />
      <DiscoverStack.Screen name="SpotDetail" component={SpotDetailScreen} />
      <DiscoverStack.Screen name="PostDetail" component={PostDetailScreen} />
      <DiscoverStack.Screen name="Comments" component={CommentsScreen} />
      <DiscoverStack.Screen name="PhotoGallery" component={PhotoGalleryScreen} />
      <DiscoverStack.Screen name="Reviews" component={ReviewsScreen} />
      <DiscoverStack.Screen name="WriteReview" component={WriteReviewScreen} />
    </DiscoverStack.Navigator>
  )
}

function CreateStackNav() {
  return (
    <CreateStack.Navigator screenOptions={{ ...stackOptions, presentation: 'modal' }}>
      <CreateStack.Screen name="CreateMenu" component={CreateMenuScreen} />
      <CreateStack.Screen name="MediaPicker" component={MediaPickerScreen} />
      <CreateStack.Screen name="PostCompose" component={PostComposeScreen} />
      <CreateStack.Screen name="SpotPicker" component={SpotPickerScreen} />
      <CreateStack.Screen name="CameraCapture" component={CameraCaptureScreen} />
      <CreateStack.Screen name="PhotoReview" component={PhotoReviewScreen} />
      <CreateStack.Screen name="CreateSpot" component={CreateSpotScreen} />
      <CreateStack.Screen name="MySpots" component={MySpotsScreen} />
      {/*
        Registered here as well as in the Profile stack (STOURIFY-118). The
        Profile stack's first screen fetches the profile, so offline it stops at
        "We could not load your profile" and everything behind it — including
        this screen — is out of reach. This stack opens on a plain menu that
        reads nothing from the server.
      */}
      <CreateStack.Screen name="SyncStatus" component={SyncStatusScreen} />
    </CreateStack.Navigator>
  )
}

function ActivityStackNav() {
  return (
    <ActivityStack.Navigator screenOptions={stackOptions}>
      <ActivityStack.Screen name="Activity" component={ActivityScreen} />
      <ActivityStack.Screen name="PostDetail" component={PostDetailScreen} />
      <ActivityStack.Screen name="Profile" component={ProfileScreen} />
    </ActivityStack.Navigator>
  )
}

function ProfileStackNav() {
  return (
    <ProfileStack.Navigator screenOptions={stackOptions}>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} />
      <ProfileStack.Screen name="FollowList" component={FollowListScreen} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} />
      <ProfileStack.Screen name="BlockedAccounts" component={BlockedAccountsScreen} />
      <ProfileStack.Screen name="SyncStatus" component={SyncStatusScreen} />
      <ProfileStack.Screen name="PostDetail" component={PostDetailScreen} />
      <ProfileStack.Screen name="SpotDetail" component={SpotDetailScreen} />
      <ProfileStack.Screen name="Comments" component={CommentsScreen} />
      <ProfileStack.Screen name="PhotoGallery" component={PhotoGalleryScreen} />
      <ProfileStack.Screen name="Reviews" component={ReviewsScreen} />
      <ProfileStack.Screen name="WriteReview" component={WriteReviewScreen} />
      <ProfileStack.Screen name="ThemeGallery" component={ThemeGalleryScreen} />
    </ProfileStack.Navigator>
  )
}

/**
 * The deck's information architecture: four tabs around a raised coral Create
 * action. See `TabBar` for why the bar is custom rather than configured.
 */
export default function TabNavigator() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tab.Screen name="HomeTab" component={HomeStackNav} />
      <Tab.Screen name="DiscoverTab" component={DiscoverStackNav} />
      <Tab.Screen name="CreateTab" component={CreateStackNav} />
      <Tab.Screen name="ActivityTab" component={ActivityStackNav} />
      <Tab.Screen name="ProfileTab" component={ProfileStackNav} />
    </Tab.Navigator>
  )
}
