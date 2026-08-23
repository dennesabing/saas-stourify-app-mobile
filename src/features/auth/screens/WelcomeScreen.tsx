import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text } from '@/shared/components/ui'
import type { RootStackParamList } from '@/shared/navigation/types'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>

/**
 * Brand entry, before the user has chosen sign-in vs. sign-up.
 *
 * No data, no test — nothing here but navigation.
 */
export default function WelcomeScreen({ navigation }: Props) {
  const theme = useTheme()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <View
        style={{ flex: 1, justifyContent: 'center', padding: theme.gutter, gap: theme.spacing[6] }}
      >
        <View style={{ gap: theme.spacing[2] }}>
          <Text variant="display">Stourify</Text>
          <Text variant="bodyLg" color="muted">
            Discover your next adventure.
          </Text>
        </View>

        <View style={{ gap: theme.spacing[3] }}>
          <Button label="Get started" onPress={() => navigation.navigate('Register')} fullWidth />
          <Button
            label="I already have an account"
            variant="secondary"
            onPress={() => navigation.navigate('Login')}
            fullWidth
          />
        </View>
      </View>
    </SafeAreaView>
  )
}
