import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Chip, Text } from '@/shared/components/ui'
import type { DiscoverStackParamList } from '@/shared/navigation/types'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<DiscoverStackParamList, 'Discover'>

const FILTERS = ['Trending', 'Nature', 'Foodie', 'Coast', 'Heritage']

/**
 * Placeholder for the Explore Grid. The real mosaic, map FAB and "For You"
 * rail land in M4 — this exists so the tab is navigable in M0 and so the
 * primitives are exercised on a real screen rather than only in the gallery.
 */
export default function DiscoverScreen({ navigation }: Props) {
  const theme = useTheme()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.gutter, gap: theme.spacing[4] }}>
        <Text variant="display">Discover</Text>
        <Text variant="bodyLg" color="muted">
          The Explore Grid, search, map and nearby list arrive in Milestone 4.
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
            {FILTERS.map((filter, index) => (
              <Chip key={filter} label={filter} selected={index === 0} />
            ))}
          </View>
        </ScrollView>

        <View style={{ gap: theme.spacing[3] }}>
          <Button label="Search spots" variant="secondary" onPress={() => navigation.navigate('Search')} />
          <Button label="Spots near me" variant="secondary" onPress={() => navigation.navigate('Nearby')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
