import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useDatabase } from '@nozbe/watermelondb/react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { OnboardingStackParamList } from '@/shared/navigation/types'
import { Button, Chip, Text } from '@/shared/components/ui'
import { INTEREST_OPTIONS } from '@/shared/constants/interests'
import { persistProfileChoice } from '@/features/onboarding/persistProfileChoice'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Interests'>

/**
 * Prefers the local `sto_explorer_profiles` row, because it is a synced,
 * pushable table (M2) — so the choice survives a bad connection and drains
 * through the existing push queue the same way `CreateSpotScreen` writes a
 * spot.
 *
 * It used to write ONLY there, and only `if (profiles.length > 0)` — which for
 * a brand-new account, the one case this screen exists for, is never true. The
 * choice went nowhere (STOURIFY-82). `persistProfileChoice` owns that fallback
 * now; see it for why the two writers exist and why a failure is swallowed.
 *
 * ## Why `edges` names `bottom` here and `top` alone elsewhere
 *
 * A phone reserves a strip along the bottom of the screen for its own back,
 * home and recents controls, and tells each app how tall that strip is.
 * `edges` is the list of sides `SafeAreaView` is allowed to pad, so naming only
 * `top` left this screen's Continue/Skip footer free to sit underneath the
 * phone's own bar — where a tap can land on the system instead of the app.
 * Skip is the only way past this step for someone who does not want to pick
 * interests, so that is a bad control to have swallowed (STOURIFY-81).
 *
 * The rest of the app gets away with `top` alone because every other screen
 * sits inside the tab navigator and its tab bar already occupies the strip.
 * Onboarding is its own stack with no tab bar, so each of its four screens
 * states the rule itself; `__tests__/features/onboarding/safeAreaEdges.test.tsx`
 * is what keeps them in step.
 */
export default function InterestsScreen({ navigation }: Props) {
  const theme = useTheme()
  const database = useDatabase()
  const [selected, setSelected] = useState<string[]>([])

  function toggle(interest: string): void {
    setSelected((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest],
    )
  }

  async function persistAndAdvance(interests: string[]): Promise<void> {
    await persistProfileChoice(database, { kind: 'interests', interests })

    navigation.navigate('HomeCity')
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: theme.gutter, gap: theme.spacing[5] }}>
        <Text variant="h1">What draws you to a place?</Text>
        <Text variant="body" color="muted">
          Pick a few — this only shapes what you see, you can change it anytime.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
          {INTEREST_OPTIONS.map((interest) => (
            <Chip
              key={interest}
              label={interest}
              selected={selected.includes(interest)}
              onPress={() => toggle(interest)}
            />
          ))}
        </View>
      </ScrollView>

      <View style={{ padding: theme.gutter, gap: theme.spacing[3] }}>
        <Button label="Continue" onPress={() => persistAndAdvance(selected)} fullWidth />
        <Button label="Skip" variant="ghost" onPress={() => persistAndAdvance([])} fullWidth />
      </View>
    </SafeAreaView>
  )
}
