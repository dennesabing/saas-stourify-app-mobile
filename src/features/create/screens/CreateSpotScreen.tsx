import { useCallback, useEffect, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useDatabase } from '@nozbe/watermelondb/react'
import { Button, Chip, KeyboardAwareScreen, Text } from '@/shared/components/ui'
import type { CreateStackParamList } from '@/shared/navigation/types'
import type { MapCoordinate } from '@/shared/map'
import { useAuthStore } from '@/shared/store/auth'
import { syncNow } from '@/sync/scheduler'
import type PendingMedia from '@/db/models/PendingMedia'
import { MAX_DRAFT_PHOTOS, observeDraftMedia } from '@/features/media/api/draftMedia'
import { publishSpot } from '@/features/create/api/publishSpot'
import LocationPicker from '@/features/create/components/LocationPicker'
import { MAX_SPOT_CATEGORIES, validateSpotForm } from '@/features/create/api/spotForm'
import { useTheme } from '@/theme/ThemeProvider'

/**
 * The categories on offer.
 *
 * The server takes free strings — `SpotStoreRequest` has no list to check
 * against — so this is the app's own shortlist, deliberately the same labels the
 * Discover filter rail uses, so what somebody tags here is what somebody else
 * can filter by there.
 */
const SPOT_CATEGORIES = [
  'Nature',
  'Foodie',
  'Coast',
  'Heritage',
  'Viewpoint',
  'Adventure',
  'Nightlife',
  'Shopping',
] as const

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
 * **Location is captured, never typed** (STOURIFY-4). `LocationPicker` owns
 * that: the phone's own position on entry, a draggable pin for correction, and
 * a stated reason on screen whenever neither is available. This screen only
 * holds the resulting coordinate, and refuses to publish without one. Note what
 * it does NOT import — no map library appears anywhere under
 * `features/create/`, because `src/shared/map/MapCanvas.tsx` is the app's only
 * map-aware file and a second one would end the one-file MapLibre swap.
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
  // Never typed: filled in from the device on entry, corrected by moving the
  // pin. `null` means nothing has placed it yet, which validation refuses.
  const [coordinate, setCoordinate] = useState<MapCoordinate | null>(null)
  const [categories, setCategories] = useState<string[]>([])
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

  /**
   * Stable, so the picker does not re-request a position every time anything
   * else on the form changes — its effect would otherwise re-run on every
   * keystroke in the title field.
   */
  const onCoordinateChange = useCallback((next: MapCoordinate) => setCoordinate(next), [])

  function toggleCategory(category: string): void {
    setCategories((previous) =>
      previous.includes(category)
        ? previous.filter((existing) => existing !== category)
        : previous.length >= MAX_SPOT_CATEGORIES
          ? previous
          : [...previous, category],
    )
  }

  async function onPublish(): Promise<void> {
    if (publishing) return

    // One rule set, shared with its own tests and kept in step with
    // `SpotStoreRequest`. A local write that the server will later refuse is
    // the failure this guards: the refusal arrives long after the person who
    // typed it stopped looking.
    const invalid = validateSpotForm({ title, description, coordinate, categories })

    if (invalid !== null) {
      setError(invalid)
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
        // Non-null by construction: `validateSpotForm` above refuses a form
        // with no position, so reaching here means one was captured or placed.
        latitude: coordinate!.latitude,
        longitude: coordinate!.longitude,
        categories,
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
    <KeyboardAwareScreen edges={['top']} contentContainerStyle={{ gap: theme.spacing[4] }}>
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

      <LocationPicker value={coordinate} onChange={onCoordinateChange} />

      <View style={{ gap: theme.spacing[2] }}>
        <Text variant="h2">Categories</Text>
        <Text variant="caption" color="muted">
          {`Optional — up to ${MAX_SPOT_CATEGORIES}.`}
        </Text>
        <View style={styles.chips}>
          {SPOT_CATEGORIES.map((category) => (
            <Chip
              key={category}
              label={category}
              selected={categories.includes(category)}
              onPress={() => toggleCategory(category)}
            />
          ))}
        </View>
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
    </KeyboardAwareScreen>
  )
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  thumbnail: { width: 96, height: 96 },
})
