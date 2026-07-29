import { createNativeStackNavigator } from '@react-navigation/native-stack'
import type { OnboardingStackParamList } from '@/shared/navigation/types'
import FollowSuggestionsScreen from './screens/FollowSuggestionsScreen'
import HomeCityScreen from './screens/HomeCityScreen'
import InterestsScreen from './screens/InterestsScreen'
import PermissionsScreen from './screens/PermissionsScreen'

const Stack = createNativeStackNavigator<OnboardingStackParamList>()

/**
 * Reached only right after registration (`RootNavigator`, gated on
 * `useOnboardingStore`) — never on an ordinary login.
 */
export default function OnboardingNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Permissions" component={PermissionsScreen} />
      <Stack.Screen name="Interests" component={InterestsScreen} />
      <Stack.Screen name="HomeCity" component={HomeCityScreen} />
      <Stack.Screen name="FollowSuggestions" component={FollowSuggestionsScreen} />
    </Stack.Navigator>
  )
}
