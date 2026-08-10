import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useDatabase } from '@nozbe/watermelondb/react'
import type PendingMedia from '@/db/models/PendingMedia'
import { Button, Card, EmptyState, Text } from '@/shared/components/ui'
import type { CreateStackParamList } from '@/shared/navigation/types'
import { useTheme } from '@/theme/ThemeProvider'
import {
  MAX_DRAFT_PHOTOS,
  observeDraftMedia,
  removeDraftMedia,
} from '@/features/media/api/draftMedia'

type Props = NativeStackScreenProps<CreateStackParamList, 'PhotoReview'>

/**
 * The review step.
 *
 * It takes **no route params**, and that is the design rather than an
 * oversight: the only thing a param could carry is a camera/picker URI, which
 * is an OS cache entry Android may reclaim (design spec §2.3 rule 4). The
 * photos are already durable `pending_media` rows by the time this screen
 * opens, so it reads them from the database and the route type stays
 * `undefined`.
 *
 * Remove deletes the file as well as the row, via the same `discardMediaRow`
 * the Sync Status screen's Discard uses (§2.4). Skipping the file half does not
 * fail anything — it just fills app-private storage with copies nothing will
 * ever collect.
 */
export default function PhotoReviewScreen({ navigation }: Props) {
  const theme = useTheme()
  const database = useDatabase()

  const [photos, setPhotos] = useState<PendingMedia[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const subscription = observeDraftMedia(database).subscribe(setPhotos)
    return () => subscription.unsubscribe()
  }, [database])

  const atCap = photos.length >= MAX_DRAFT_PHOTOS

  async function onRemove(id: string): Promise<void> {
    if (busyId !== null) return

    setBusyId(id)
    try {
      await removeDraftMedia(database, id)
    } finally {
      setBusyId(null)
    }
  }

  async function onRetake(id: string): Promise<void> {
    await onRemove(id)
    navigation.navigate('CameraCapture')
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.surface }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.gutter, gap: theme.spacing[4] }}>
        <Text variant="h1">Your photos</Text>
        <Text variant="caption" color="muted">
          {`${photos.length} of ${MAX_DRAFT_PHOTOS}`}
        </Text>

        {photos.length === 0 ? (
          <EmptyState
            icon="📷"
            title="No photos yet"
            subtitle="Take a photo of the spot — it is saved on this device straight away, with or without a signal."
            actionLabel="Open camera"
            onAction={() => navigation.navigate('CameraCapture')}
          />
        ) : null}

        {photos.map((photo) => (
          <Card key={photo.id} style={styles.card}>
            <View style={{ gap: theme.spacing[3] }}>
              <Image
                source={{ uri: photo.localPath }}
                style={[styles.thumbnail, { borderRadius: theme.radius.button }]}
                contentFit="cover"
                accessibilityLabel={photo.filename}
              />
              <Text variant="caption" color="muted">
                {photo.filename}
              </Text>
              <View style={{ flexDirection: 'row', gap: theme.spacing[3] }}>
                <Button
                  label="Retake"
                  variant="secondary"
                  onPress={() => {
                    void onRetake(photo.id)
                  }}
                  accessibilityLabel={`Retake ${photo.filename}`}
                  disabled={busyId !== null}
                />
                <Button
                  label="Remove"
                  variant="danger"
                  onPress={() => {
                    void onRemove(photo.id)
                  }}
                  accessibilityLabel={`Remove ${photo.filename}`}
                  disabled={busyId !== null}
                />
              </View>
            </View>
          </Card>
        ))}

        {photos.length > 0 ? (
          <View style={{ gap: theme.spacing[3] }}>
            {atCap ? (
              <Text variant="caption" color="muted">
                {`That is all ${MAX_DRAFT_PHOTOS} photos. Remove one to take another.`}
              </Text>
            ) : null}
            <Button
              label="Take another"
              variant="secondary"
              onPress={() => navigation.navigate('CameraCapture')}
              accessibilityLabel="Take another photo"
              disabled={atCap}
              fullWidth
            />
            <Button
              label="Done"
              onPress={() => navigation.navigate('CreateMenu')}
              accessibilityLabel="Done adding photos"
              fullWidth
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { padding: 12 },
  thumbnail: { width: '100%', height: 200 },
})
