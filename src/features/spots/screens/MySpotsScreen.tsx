import { FlatList, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { EmptyState, SpotCard, Text } from '@/shared/components/ui'
import type { CreateStackParamList } from '@/shared/navigation/types'
import { useMySpots } from '@/features/spots/hooks/useMySpots'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<CreateStackParamList, 'MySpots'>

/**
 * What to say about a spot that is not live, in words that answer the question
 * the reader actually has -- "can anyone see this?" -- rather than naming the
 * state it is in.
 */
const DRAFT_META: Record<string, string> = {
  draft: 'Draft — not visible to anyone',
  under_review: 'Being checked — not visible yet',
  removed: 'Removed — not visible to anyone',
}

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
            /*
              Whether this spot is actually live (STOURIFY-202).

              Every spot the app created was silently saved as an unfinished
              draft and never published, so nobody -- including its author --
              could find it anywhere. This list is where that should have been
              obvious and was not: a draft and a live spot looked identical
              here, so the app's own list gave no hint that nothing had gone
              out. A published spot says nothing, because that is the ordinary
              case and a badge on everything is a badge on nothing.
            */
            meta={
              item.status === 'published' ? null : (DRAFT_META[item.status] ?? 'Not visible yet')
            }
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
