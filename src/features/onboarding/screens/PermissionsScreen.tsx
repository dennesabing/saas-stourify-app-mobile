import { useState } from 'react'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { OnboardingStackParamList } from '@/shared/navigation/types'
import { Button, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Permissions'>

/**
 * Location only — no notification permission. `expo-notifications` is not
 * installed and push is M5 work; asking for a permission this app cannot yet
 * act on is worse than not asking.
 *
 * The copy runs BEFORE the OS prompt, deliberately: requesting cold, with no
 * explanation on screen first, is the top reason a permission prompt gets a
 * permanent "Don't ask again".
 *
 * `edges` names `bottom` as well as `top` even though this screen's buttons sit
 * in a vertically centred block rather than against the bottom. It is the same
 * stack and the same rule, and leaving the one screen out is how the next
 * person to anchor something here inherits the bug (STOURIFY-81).
 */
export default function PermissionsScreen({ navigation }: Props) {
  const theme = useTheme()
  const [requesting, setRequesting] = useState(false)

  async function handleEnable(): Promise<void> {
    setRequesting(true)
    try {
      await Location.requestForegroundPermissionsAsync()
    } finally {
      setRequesting(false)
      navigation.navigate('Interests')
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top', 'bottom']}>
      <View style={{ flex: 1, justifyContent: 'center', padding: theme.gutter, gap: theme.spacing[5] }}>
        <Text style={{ fontSize: 48, lineHeight: 56 }}>📍</Text>
        <Text variant="h1">Find spots near you</Text>
        <Text variant="body" color="muted">
          Stourify uses your location to show nearby spots and put you on the map when you check in.
          You can turn this off anytime in Settings.
        </Text>
        <View style={{ gap: theme.spacing[3] }}>
          <Button label="Enable location" onPress={handleEnable} loading={requesting} fullWidth />
          <Button
            label="Skip"
            variant="ghost"
            onPress={() => navigation.navigate('Interests')}
            fullWidth
          />
        </View>
      </View>
    </SafeAreaView>
  )
}
