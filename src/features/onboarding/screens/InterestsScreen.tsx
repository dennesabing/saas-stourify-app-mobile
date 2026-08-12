import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useDatabase } from '@nozbe/watermelondb/react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { OnboardingStackParamList } from '@/shared/navigation/types'
import { Button, Chip, Text } from '@/shared/components/ui'
import { INTEREST_OPTIONS } from '@/shared/constants/interests'
import { syncNow } from '@/sync/scheduler'
import type ExplorerProfile from '@/db/models/ExplorerProfile'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Interests'>

/**
 * Writes straight to the local `sto_explorer_profiles` row and never to the
 * network. `sto_explorer_profiles` is a synced, pushable table (M2), so the
 * choice survives a bad connection and drains through the existing push
 * queue the same way `CreateSpotScreen` writes a spot.
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
    if (interests.length > 0) {
      const profiles = await database.get<ExplorerProfile>('sto_explorer_profiles').query().fetch()

      if (profiles.length > 0) {
        await database.write(async () => {
          await profiles[0].update((row: any) => {
            row._setRaw('interests', JSON.stringify(interests))
          })
        })

        // A nudge, not a dependency: the row is already durable locally.
        void syncNow(database)
      }
    }

    navigation.navigate('HomeCity')
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
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
