import { useEffect, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useDatabase } from '@nozbe/watermelondb/react'
import { Button, Text } from '@/shared/components/ui'
import type { CreateStackParamList } from '@/shared/navigation/types'
import { useAuthStore } from '@/shared/store/auth'
import { syncNow } from '@/sync/scheduler'
import type PendingMedia from '@/db/models/PendingMedia'
import { MAX_DRAFT_PHOTOS, observeDraftMedia } from '@/features/media/api/draftMedia'
import { publishSpot } from '@/features/create/api/publishSpot'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<CreateStackParamList, 'CreateSpot'>

/**
 * The offline-first vertical slice, and the review-and-publish step that closes
 * the M4 gate.
 *
 * It writes straight to WatermelonDB and NEVER to the network. There is
 * deliberately no loading state for the write: a local write cannot fail for
 * network reasons, so a spinner would be describing a risk that does not exist.
 * The drain happens in the background; `syncNow` is a nudge, not a dependency —
 * the spot and its photos are already durable when it returns.
 *
 * That inversion — the network is a background concern, not a screen concern —
 * is the pattern M3 copies for every other owned entity.
 *
 * The photo strip reads the database rather than a route param, for the reason
 * `CreateStackParamList` spells out: a camera URI is an OS cache entry Android
 * may reclaim (design spec §2.3 rule 4). Capture writes a durable
 * `pending_media` row before it navigates, and publish is what binds those rows
 * to this spot.
 */
export default function CreateSpotScreen({ navigation }: Props) {
  const theme = useTheme()
  const database = useDatabase()
  const userId = useAuthStore((state) => state.user?.id ?? null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [photos, setPhotos] = useState<PendingMedia[]>([])
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    // Subscribe rather than refetch on focus: a photo removed on the review
    // step has to update this strip, and a focus-driven refetch would miss a
    // change made while this screen was already mounted underneath it.
    const subscription = observeDraftMedia(database).subscribe(setPhotos)
    return () => subscription.unsubscribe()
  }, [database])

  const atCap = photos.length >= MAX_DRAFT_PHOTOS

  const inputStyle = {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.hairline,
    borderWidth: 1,
    borderRadius: theme.radius.button,
    padding: theme.spacing[4],
    color: theme.colors.ink,
    minHeight: theme.minTouchTarget,
  }

  async function onPublish(): Promise<void> {
    if (publishing) return

    if (title.trim().length < 3) {
      setError('A spot needs a name of at least 3 characters.')
      return
    }

    const lat = Number(latitude)
    const lng = Number(longitude)

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setError('Latitude must be between -90 and 90.')
      return
    }

    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      setError('Longitude must be between -180 and 180.')
      return
    }

    setError(null)
    setPublishing(true)

    try {
      // One call writes the spot and binds every captured photo to its uuid.
      // The uuid is minted in there, before the write — it is the row's
      // identity, the key the server resolves the push by, and the
      // `model_uuid` each photo's later `attach` resolves against.
      await publishSpot(database, {
        title,
        description,
        latitude: lat,
        longitude: lng,
        userId: userId === null ? null : Number(userId),
      })
    } catch (publishError) {
      // Reaching here means an invariant broke, not that the network did —
      // publish never touches it. Say so rather than inventing a retry.
      setError(
        publishError instanceof Error
          ? publishError.message
          : 'That spot could not be published. Try again.',
      )
      return
    } finally {
      setPublishing(false)
    }

    // A nudge, not a dependency: the rows are already durable and will drain on
    // the next trigger regardless of whether this resolves.
    void syncNow(database)

    navigation.navigate('MySpots')
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.gutter, gap: theme.spacing[4] }}>
        <Text variant="h1">New spot</Text>
        <Text variant="body" color="muted">
          Saved on this device straight away. It uploads itself when you are back online.
        </Text>

        <TextInput
          style={inputStyle}
          placeholder="Spot name"
          placeholderTextColor={theme.colors.muted}
          value={title}
          onChangeText={setTitle}
        />

        <TextInput
          style={[inputStyle, styles.multiline]}
          placeholder="What makes it worth the trip?"
          placeholderTextColor={theme.colors.muted}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <View style={styles.row}>
          <TextInput
            style={[inputStyle, styles.half]}
            placeholder="Latitude"
            placeholderTextColor={theme.colors.muted}
            keyboardType="numbers-and-punctuation"
            value={latitude}
            onChangeText={setLatitude}
          />
          <TextInput
            style={[inputStyle, styles.half]}
            placeholder="Longitude"
            placeholderTextColor={theme.colors.muted}
            keyboardType="numbers-and-punctuation"
            value={longitude}
            onChangeText={setLongitude}
          />
        </View>

        <View style={{ gap: theme.spacing[2] }}>
          <Text variant="h2">Photos</Text>
          <Text variant="caption" color="muted">
            {`${photos.length} of ${MAX_DRAFT_PHOTOS}`}
          </Text>
        </View>

        {photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: theme.spacing[3] }}>
              {photos.map((photo) => (
                <Pressable
                  key={photo.id}
                  onPress={() => navigation.navigate('PhotoReview')}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={photo.filename}
                >
                  <Image
                    source={{ uri: photo.localPath }}
                    style={[
                      styles.thumbnail,
                      { borderRadius: theme.radius.button, backgroundColor: theme.colors.surfaceAlt },
                    ]}
                    resizeMode="cover"
                  />
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : (
          <Text variant="caption" color="muted">
            No photos yet. They are saved on this device the moment you take them, signal or not.
          </Text>
        )}

        {atCap ? (
          <Text variant="caption" color="muted">
            {`That is all ${MAX_DRAFT_PHOTOS} photos. Remove one to take another.`}
          </Text>
        ) : null}

        <Button
          label="Add photos"
          variant="secondary"
          onPress={() => navigation.navigate('CameraCapture')}
          accessibilityLabel="Add photos"
          disabled={atCap}
          fullWidth
        />

        {error !== null ? (
          <Text variant="caption" style={{ color: theme.colors.danger }}>
            {error}
          </Text>
        ) : null}

        <Button
          label="Publish spot"
          onPress={() => {
            void onPublish()
          }}
          disabled={publishing}
          fullWidth
        />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  thumbnail: { width: 96, height: 96 },
})
