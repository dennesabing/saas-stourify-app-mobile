import { useState } from 'react'
import { Dimensions, FlatList, Pressable, View, type ViewToken } from 'react-native'
import { Image } from 'expo-image'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { HomeStackParamList } from '@/shared/navigation/types'
import { getSpot } from '@/shared/api/spots'
import { EmptyState, Text } from '@/shared/components/ui'
import type { SpotMedia } from '@/shared/api/types'
import { useTheme } from '@/theme/ThemeProvider'

const { width, height } = Dimensions.get('window')

type Props = NativeStackScreenProps<HomeStackParamList, 'PhotoGallery'>

/**
 * Full-bleed, swipeable photo gallery — `media[].url` is the only populated
 * field (`thumb_url` is always null today, no conversion is registered), so
 * this renders `url` directly rather than pretending a thumbnail exists.
 */
export default function PhotoGalleryScreen({ route, navigation }: Props) {
  const { spotId } = route.params
  const theme = useTheme()
  const [index, setIndex] = useState(0)

  const { data: spot } = useQuery({
    queryKey: ['spot', spotId],
    queryFn: () => getSpot(spotId),
  })

  const media = spot?.media ?? []

  function onViewableItemsChanged({ viewableItems }: { viewableItems: ViewToken[] }) {
    const first = viewableItems[0]
    if (first && typeof first.index === 'number') setIndex(first.index)
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: media.length > 0 ? theme.colors.ink : theme.colors.surface }}
      edges={['top']}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => navigation.goBack()}
        style={{
          position: 'absolute',
          top: theme.spacing[3],
          left: theme.spacing[3],
          zIndex: 10,
          minWidth: theme.minTouchTarget,
          minHeight: theme.minTouchTarget,
          borderRadius: theme.radius.chip,
          backgroundColor: theme.colors.card,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: theme.spacing[3],
        }}
      >
        <Text variant="body" color="ink">
          ← Back
        </Text>
      </Pressable>

      {media.length === 0 ? (
        <EmptyState icon="🖼" title="No photos yet" subtitle="This spot has no photos to show yet." />
      ) : (
        <>
          <FlatList
            data={media}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.uuid}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
            renderItem={({ item, index: itemIndex }: { item: SpotMedia; index: number }) => (
              <Image
                testID={`gallery-photo-${itemIndex}`}
                source={{ uri: item.url }}
                style={{ width, height }}
                contentFit="contain"
              />
            )}
          />

          <View
            style={{
              position: 'absolute',
              bottom: theme.spacing[5],
              alignSelf: 'center',
              backgroundColor: theme.colors.card,
              borderRadius: theme.radius.chip,
              paddingHorizontal: theme.spacing[4],
              paddingVertical: theme.spacing[1],
            }}
          >
            <Text variant="caption" color="ink">
              {index + 1} / {media.length}
            </Text>
          </View>
        </>
      )}
    </SafeAreaView>
  )
}
