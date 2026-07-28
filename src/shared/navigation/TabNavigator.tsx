import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import ActivityScreen from '@/features/activity/screens/ActivityScreen'
import CreateMenuScreen from '@/features/create/screens/CreateMenuScreen'
import CreateSpotScreen from '@/features/create/screens/CreateSpotScreen'
import ThemeGalleryScreen from '@/features/dev/screens/ThemeGalleryScreen'
import DiscoverScreen from '@/features/discover/screens/DiscoverScreen'
import FeedScreen from '@/features/feed/screens/FeedScreen'
import PostDetailScreen from '@/features/feed/screens/PostDetailScreen'
import NearbyScreen from '@/features/nearby/screens/NearbyScreen'
import EditProfileScreen from '@/features/profile/screens/EditProfileScreen'
import FollowListScreen from '@/features/profile/screens/FollowListScreen'
import ProfileScreen from '@/features/profile/screens/ProfileScreen'
import SettingsScreen from '@/features/profile/screens/SettingsScreen'
import SearchScreen from '@/features/search/screens/SearchScreen'
import MediaPickerScreen from '@/features/social/screens/MediaPickerScreen'
import PostComposeScreen from '@/features/social/screens/PostComposeScreen'
import SpotPickerScreen from '@/features/social/screens/SpotPickerScreen'
import MySpotsScreen from '@/features/spots/screens/MySpotsScreen'
import SpotDetailScreen from '@/features/spots/screens/SpotDetailScreen'
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
      <HomeStack.Screen name="SpotDetail" component={SpotDetailScreen} />
    </HomeStack.Navigator>
  )
}

function DiscoverStackNav() {
  return (
    <DiscoverStack.Navigator screenOptions={stackOptions}>
      <DiscoverStack.Screen name="Discover" component={DiscoverScreen} />
      <DiscoverStack.Screen name="Search" component={SearchScreen} />
      <DiscoverStack.Screen name="Nearby" component={NearbyScreen} />
      <DiscoverStack.Screen name="SpotDetail" component={SpotDetailScreen} />
      <DiscoverStack.Screen name="PostDetail" component={PostDetailScreen} />
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
      <CreateStack.Screen name="CreateSpot" component={CreateSpotScreen} />
      <CreateStack.Screen name="MySpots" component={MySpotsScreen} />
    </CreateStack.Navigator>
  )
}

function ActivityStackNav() {
  return (
    <ActivityStack.Navigator screenOptions={stackOptions}>
      <ActivityStack.Screen name="Activity" component={ActivityScreen} />
      <ActivityStack.Screen name="PostDetail" component={PostDetailScreen} />
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
      <ProfileStack.Screen name="PostDetail" component={PostDetailScreen} />
      <ProfileStack.Screen name="SpotDetail" component={SpotDetailScreen} />
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
