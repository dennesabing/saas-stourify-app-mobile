import { Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { BuildIdentity, Button, Text } from '@/shared/components/ui'
import type { RootStackParamList } from '@/shared/navigation/types'
import { useTheme } from '@/theme/ThemeProvider'
import HeroBackdrop from '../components/HeroBackdrop'
import { useScreenFocused } from '../components/useScreenFocused'

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>

/**
 * Brand entry, before the user has chosen sign-in vs. sign-up — the Auth &
 * Entry design's WELCOME (STOURIFY-286).
 *
 * The canvas lays this over a stock beach photo. The app ships no photo, and a
 * hotlinked one would be a blank page offline — so the brand gradient stands in,
 * with the canvas's own navy fade at the bottom kept, because that fade is what
 * makes white text readable there. It is brand-coloured in both themes, deepened
 * on a dark phone. The canvas's three pager dots are left out: there is one
 * page, and dots promise more.
 */
export default function WelcomeScreen({ navigation }: Props) {
  const theme = useTheme()
  const focused = useScreenFocused(navigation)

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.heroVia }}>
      <HeroBackdrop shade />
      {/* White clock and battery on the blue, only while this screen is on top. */}
      {focused ? <StatusBar style="light" /> : null}

      <SafeAreaView style={{ flex: 1 }}>
        <Text
          variant="h2"
          color="onButton"
          accessibilityRole="header"
          style={{
            textAlign: 'center',
            fontFamily: theme.fontFamily.displayBold,
            fontSize: 22,
            marginTop: theme.spacing[2],
          }}
        >
          Stourify
        </Text>

        <View style={{ flex: 1 }} />

        <View style={{ paddingHorizontal: 30 }}>
          <Text variant="display" color="onButton" style={{ fontSize: 36, lineHeight: 40 }}>
            Discover your next adventure
          </Text>
          <Text variant="bodyLg" color="onButton" style={{ marginTop: 14, opacity: 0.92 }}>
            Real spots, shared by explorers who actually go there — hidden gems, scenic views, and
            local flavor.
          </Text>

          <Button
            label="Get started"
            size="lg"
            onPress={() => navigation.navigate('Register')}
            fullWidth
            style={{ marginTop: 26 }}
          />

          <Pressable
            onPress={() => navigation.navigate('Login')}
            accessibilityRole="button"
            style={({ pressed }) => ({
              minHeight: theme.minTouchTarget,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: theme.spacing[2],
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              variant="body"
              color="onButton"
              style={{ fontFamily: theme.fontFamily.bodyMedium }}
            >
              I already have an account
            </Text>
          </Pressable>
        </View>

        <BuildIdentity color={theme.colors.onButton} style={{ opacity: 0.7 }} />
      </SafeAreaView>
    </View>
  )
}
