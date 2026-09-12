import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useDatabase } from '@nozbe/watermelondb/react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { OnboardingStackParamList } from '@/shared/navigation/types'
import { Button, Chip } from '@/shared/components/ui'
import { INTEREST_OPTIONS } from '@/shared/constants/interests'
import OnboardingFrame from '@/features/onboarding/components/OnboardingFrame'
import { persistProfileChoice } from '@/features/onboarding/persistProfileChoice'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Interests'>

/**
 * Artboard 2 of the Onboarding design (STOURIFY-287). The canvas draws photo
 * tiles; the app offers its own `INTEREST_OPTIONS` as chips, because those
 * strings are what gets saved and what Edit Profile offers, and a photo per
 * interest would be an internet download on a screen that must work offline.
 * The pinned button counts the picks — "Continue · 2 selected".
 *
 * Prefers the local `sto_explorer_profiles` row, because it is a synced,
 * pushable table (M2) — so the choice survives a bad connection and drains
 * through the existing push queue the same way `CreateSpotScreen` writes a
 * spot.
 *
 * It used to write ONLY there, and only `if (profiles.length > 0)` — which for
 * a brand-new account, the one case this screen exists for, is never true. The
 * choice went nowhere (STOURIFY-82). `persistProfileChoice` owns that fallback
 * now; see it for why the two writers exist and why a failure is swallowed.
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

  const label = selected.length > 0 ? `Continue · ${selected.length} selected` : 'Continue'

  return (
    <OnboardingFrame
      step={2}
      onSkip={() => void persistAndAdvance([])}
      title="What are you into?"
      subtitle="Pick a few — you can change them anytime in Edit Profile."
      footer={
        <Button label={label} size="lg" onPress={() => persistAndAdvance(selected)} fullWidth />
      }
    >
      <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing[4] }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[3] }}>
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
    </OnboardingFrame>
  )
}
