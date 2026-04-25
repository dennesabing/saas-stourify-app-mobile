import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Text } from 'react-native'
import type {
  FeedStackParamList,
  NearbyStackParamList,
  CreateStackParamList,
  SearchStackParamList,
  ProfileStackParamList,
} from '@/shared/navigation/types'
import FeedScreen from '@/features/feed/screens/FeedScreen'
import PostDetailScreen from '@/features/feed/screens/PostDetailScreen'
import NearbyScreen from '@/features/nearby/screens/NearbyScreen'
import SpotDetailScreen from '@/features/spots/screens/SpotDetailScreen'
import MediaPickerScreen from '@/features/social/screens/MediaPickerScreen'
import PostComposeScreen from '@/features/social/screens/PostComposeScreen'
import SpotPickerScreen from '@/features/social/screens/SpotPickerScreen'
import SearchScreen from '@/features/search/screens/SearchScreen'
import ProfileScreen from '@/features/profile/screens/ProfileScreen'
import FollowListScreen from '@/features/profile/screens/FollowListScreen'
import EditProfileScreen from '@/features/profile/screens/EditProfileScreen'
import SettingsScreen from '@/features/profile/screens/SettingsScreen'

const Tab = createBottomTabNavigator()
const FeedStack = createNativeStackNavigator<FeedStackParamList>()
const NearbyStack = createNativeStackNavigator<NearbyStackParamList>()
const CreateStack = createNativeStackNavigator<CreateStackParamList>()
const SearchStack = createNativeStackNavigator<SearchStackParamList>()
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>()

function FeedStackNav() {
  return (
    <FeedStack.Navigator>
      <FeedStack.Screen name="Feed" component={FeedScreen} />
      <FeedStack.Screen name="PostDetail" component={PostDetailScreen} />
    </FeedStack.Navigator>
  )
}

function NearbyStackNav() {
  return (
    <NearbyStack.Navigator>
      <NearbyStack.Screen name="Nearby" component={NearbyScreen} />
      <NearbyStack.Screen name="SpotDetail" component={SpotDetailScreen} />
      <NearbyStack.Screen name="PostDetail" component={PostDetailScreen} />
    </NearbyStack.Navigator>
  )
}

function CreateStackNav() {
  return (
    <CreateStack.Navigator screenOptions={{ presentation: 'modal' }}>
      <CreateStack.Screen name="MediaPicker" component={MediaPickerScreen} />
      <CreateStack.Screen name="PostCompose" component={PostComposeScreen} />
      <CreateStack.Screen name="SpotPicker" component={SpotPickerScreen} />
    </CreateStack.Navigator>
  )
}

function SearchStackNav() {
  return (
    <SearchStack.Navigator>
      <SearchStack.Screen name="Search" component={SearchScreen} />
      <SearchStack.Screen name="SpotDetail" component={SpotDetailScreen} />
      <SearchStack.Screen name="PostDetail" component={PostDetailScreen} />
    </SearchStack.Navigator>
  )
}

function ProfileStackNav() {
  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} />
      <ProfileStack.Screen name="FollowList" component={FollowListScreen} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} />
      <ProfileStack.Screen name="PostDetail" component={PostDetailScreen} />
    </ProfileStack.Navigator>
  )
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen
        name="FeedTab"
        component={FeedStackNav}
        options={{ title: 'Feed', tabBarIcon: (_props) => <Text>🏠</Text> }}
      />
      <Tab.Screen
        name="NearbyTab"
        component={NearbyStackNav}
        options={{ title: 'Nearby', tabBarIcon: (_props) => <Text>📍</Text> }}
      />
      <Tab.Screen
        name="CreateTab"
        component={CreateStackNav}
        options={{ title: 'Create', tabBarIcon: (_props) => <Text>➕</Text> }}
      />
      <Tab.Screen
        name="SearchTab"
        component={SearchStackNav}
        options={{ title: 'Search', tabBarIcon: (_props) => <Text>🔍</Text> }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNav}
        options={{ title: 'Profile', tabBarIcon: (_props) => <Text>👤</Text> }}
      />
    </Tab.Navigator>
  )
}
