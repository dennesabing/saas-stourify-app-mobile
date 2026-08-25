import { FlatList, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { EmptyState, SpotCard, Text } from '@/shared/components/ui'
import type { CreateStackParamList } from '@/shared/navigation/types'
import { useMySpots } from '@/features/spots/hooks/useMySpots'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<CreateStackParamList, 'MySpots'>

/**
 * Observes the local collection directly — no React Query, no fetch, no refresh
 * control. A spot appears the instant it is written and its `Queued ↑` badge
 * clears the instant the drain acks it, because both are the same subscription.
 */
export default function MySpotsScreen({ navigation }: Props) {
  const theme = useTheme()
  const spots = useMySpots()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <View style={{ padding: theme.gutter }}>
        <Text variant="h1">My spots</Text>
      </View>

      <FlatList
        data={spots}
        keyExtractor={(spot) => spot.id}
        contentContainerStyle={{ paddingHorizontal: theme.gutter, gap: theme.spacing[3] }}
        ListEmptyComponent={
          <EmptyState
            title="No spots yet"
            actionLabel="Add a spot"
            onAction={() => navigation.navigate('CreateSpot')}
          />
        }
        renderItem={({ item }) => (
          <SpotCard
            title={item.title}
            layout="wide"
            /* This line is the whole of STOURIFY-192. The card has always been
               able to draw a photo; this screen simply never handed it one, so
               every row showed the grey placeholder and looked like a broken
               image. */
            imageUri={item.coverPhotoUrl}
            rating={item.ratingAverage}
            reviewCount={item.reviewsCount}
            isQueued={item.isQueued}
          />
        )}
      />
    </SafeAreaView>
  )
}
