import { useState } from 'react'
import { FlatList, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useDatabase } from '@nozbe/watermelondb/react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { OnboardingStackParamList } from '@/shared/navigation/types'
import { useCities } from '@/features/onboarding/hooks/useCities'
import { Button, Chip, EmptyState, Text } from '@/shared/components/ui'
import { syncNow } from '@/sync/scheduler'
import type ExplorerProfile from '@/db/models/ExplorerProfile'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<OnboardingStackParamList, 'HomeCity'>

/**
 * Reads `sto_cities` from the local database only — cities are pull-only
 * reference data already synced by M2, so this screen is offline by
 * construction. An empty local table means the first delta has not landed
 * yet (a fresh account), never "there are no cities" — so it shows a
 * still-syncing state, not a bare empty list.
 */
export default function HomeCityScreen({ navigation }: Props) {
  const theme = useTheme()
  const database = useDatabase()
  const cities = useCities()
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null)

  async function persistAndAdvance(): Promise<void> {
    const city = cities.find((c) => c.id === selectedCityId)

    if (city && city.serverId !== null) {
      const profiles = await database.get<ExplorerProfile>('sto_explorer_profiles').query().fetch()

      if (profiles.length > 0) {
        await database.write(async () => {
          await profiles[0].update((row: any) => {
            row._setRaw('home_city_id', city.serverId)
          })
        })

        void syncNow(database)
      }
    }

    navigation.navigate('FollowSuggestions')
  }

  if (cities.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
        <EmptyState
          icon="🧭"
          title="Still syncing your cities"
          subtitle="This only takes a moment on your first launch."
          actionLabel="Skip"
          onAction={() => navigation.navigate('FollowSuggestions')}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <View style={{ padding: theme.gutter, gap: theme.spacing[2] }}>
        <Text variant="h1">Where do you explore from?</Text>
        <Text variant="body" color="muted">
          This sets your default view — you can change it later.
        </Text>
      </View>

      <FlatList
        data={cities}
        keyExtractor={(city) => city.id}
        contentContainerStyle={{
          paddingHorizontal: theme.gutter,
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing[2],
        }}
        renderItem={({ item }) => (
          <Chip
            label={item.name}
            selected={selectedCityId === item.id}
            onPress={() => setSelectedCityId(item.id)}
          />
        )}
      />

      <View style={{ padding: theme.gutter, gap: theme.spacing[3] }}>
        <Button label="Continue" onPress={persistAndAdvance} disabled={!selectedCityId} fullWidth />
        <Button
          label="Skip"
          variant="ghost"
          onPress={() => navigation.navigate('FollowSuggestions')}
          fullWidth
        />
      </View>
    </SafeAreaView>
  )
}
