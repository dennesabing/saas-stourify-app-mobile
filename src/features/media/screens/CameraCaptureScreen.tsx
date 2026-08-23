import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useDatabase } from '@nozbe/watermelondb/react'
import { Button, Text } from '@/shared/components/ui'
import type { CreateStackParamList } from '@/shared/navigation/types'
import { useTheme } from '@/theme/ThemeProvider'
import {
  MAX_DRAFT_PHOTOS,
  observeDraftMedia,
  queueCapturedPhoto,
} from '@/features/media/api/draftMedia'

type Props = NativeStackScreenProps<CreateStackParamList, 'CameraCapture'>

/**
 * The first `expo-camera` surface in the app.
 *
 * One rule shapes everything here: a captured frame goes into the outbox
 * **before** anything else happens (design spec §2.3 rule 4). The camera hands
 * back a URI into OS-owned cache; carrying that URI forward in navigation state
 * and queueing it later is the difference between "offline-capable" and "works
 * if you reconnect before Android reclaims the cache". So `queueCapturedPhoto`
 * is awaited, and only then does the review step open — which is why this
 * screen navigates with no arguments at all.
 *
 * The system camera (`ImagePicker.launchCameraAsync`) would have been one call
 * and would have brought the native crop editor with it. It is not used because
 * it replaces this surface with the OEM camera app's chrome; crop is offered on
 * the gallery path, where the picker's own editor can provide it. Filters are
 * cut (cut-list item 4).
 */
export default function CameraCaptureScreen({ navigation }: Props) {
  const theme = useTheme()
  const database = useDatabase()
  const cameraRef = useRef<CameraView>(null)

  const [permission, requestPermission] = useCameraPermissions()
  const [facing, setFacing] = useState<CameraType>('back')
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const subscription = observeDraftMedia(database).subscribe((rows) => setCount(rows.length))
    return () => subscription.unsubscribe()
  }, [database])

  const atCap = count >= MAX_DRAFT_PHOTOS

  async function queue(input: { uri: string; filename: string; mime: string }): Promise<void> {
    await queueCapturedPhoto(database, input)
    navigation.navigate('PhotoReview')
  }

  async function onCapture(): Promise<void> {
    if (atCap || busy) return

    setBusy(true)
    setError(null)

    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.8 })
      if (!photo?.uri) return

      await queue({
        uri: photo.uri,
        filename: `stourify-${Date.now()}.jpg`,
        mime: 'image/jpeg',
      })
    } catch {
      setError('That photo could not be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function onPickFromGallery(): Promise<void> {
    if (atCap || busy) return

    setBusy(true)
    setError(null)

    try {
      const granted = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!granted.granted) {
        setError('Stourify needs access to your photos to add one from the gallery.')
        return
      }

      // `allowsEditing` is the picker's own native crop editor — the only
      // cropping this card ships, and the reason gallery picks get one while a
      // captured frame gets Retake instead.
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        quality: 0.8,
      })

      if (result.canceled) return

      const asset = result.assets?.[0]
      if (!asset?.uri) return

      await queue({
        uri: asset.uri,
        filename: asset.fileName ?? `stourify-${Date.now()}.jpg`,
        mime: asset.mimeType ?? 'image/jpeg',
      })
    } catch {
      setError('That photo could not be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const galleryButton = (
    <Button
      label="Choose from gallery"
      variant="ghost"
      onPress={onPickFromGallery}
      disabled={atCap || busy}
      accessibilityLabel="Choose from gallery"
      fullWidth
    />
  )

  // `null` is "still resolving" — rendering the denied copy here would accuse
  // the user of refusing something they were never asked.
  if (permission === null) {
    return (
      <SafeAreaView
        style={[styles.fill, { backgroundColor: theme.colors.surface }]}
        edges={['top']}
      >
        <View style={[styles.centred, { padding: theme.gutter }]}>
          <Text variant="body" color="muted">
            Preparing the camera…
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  if (!permission.granted) {
    return (
      <SafeAreaView
        style={[styles.fill, { backgroundColor: theme.colors.surface }]}
        edges={['top']}
      >
        <View style={[styles.centred, { padding: theme.gutter, gap: theme.spacing[4] }]}>
          <Text style={styles.glyph}>📷</Text>
          <Text variant="h1">Camera access</Text>
          <Text variant="body" color="muted" style={styles.centredText}>
            Stourify uses the camera to capture the spots you share. Photos stay on this device
            until you publish them.
          </Text>
          {error !== null ? (
            <Text variant="caption" style={{ color: theme.colors.danger }}>
              {error}
            </Text>
          ) : null}
          <View style={{ gap: theme.spacing[3], alignSelf: 'stretch' }}>
            <Button
              label="Allow camera"
              onPress={() => {
                void requestPermission()
              }}
              accessibilityLabel="Allow camera"
              fullWidth
            />
            {galleryButton}
          </View>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.surface }]} edges={['top']}>
      <View style={{ padding: theme.gutter, gap: theme.spacing[2] }}>
        <Text variant="h1">Add photos</Text>
        <Text variant="caption" color="muted">
          {`${count} of ${MAX_DRAFT_PHOTOS}`}
        </Text>
      </View>

      <View
        style={[
          styles.preview,
          { borderRadius: theme.radius.card, marginHorizontal: theme.gutter },
        ]}
      >
        <CameraView ref={cameraRef} style={styles.fill} facing={facing} />
      </View>

      <View style={{ padding: theme.gutter, gap: theme.spacing[3] }}>
        {error !== null ? (
          <Text variant="caption" style={{ color: theme.colors.danger }}>
            {error}
          </Text>
        ) : null}

        {atCap ? (
          <Text variant="caption" color="muted">
            {`That is all ${MAX_DRAFT_PHOTOS} photos. Remove one to take another.`}
          </Text>
        ) : null}

        <View style={styles.controls}>
          <Button
            label="Flip"
            variant="secondary"
            onPress={() => setFacing((current) => (current === 'back' ? 'front' : 'back'))}
            accessibilityLabel="Flip camera"
          />

          <Pressable
            onPress={() => {
              void onCapture()
            }}
            disabled={atCap || busy}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            accessibilityState={{ disabled: atCap || busy, busy }}
            style={({ pressed }) => [
              styles.shutter,
              {
                backgroundColor: theme.colors.accent,
                borderColor: theme.colors.card,
                opacity: atCap || busy ? 0.4 : pressed ? 0.9 : 1,
              },
            ]}
          />

          <Button
            label="Review"
            variant="secondary"
            onPress={() => navigation.navigate('PhotoReview')}
            accessibilityLabel="Review photos"
          />
        </View>

        {galleryButton}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centredText: { textAlign: 'center' },
  glyph: { fontSize: 48, lineHeight: 56 },
  preview: { flex: 1, overflow: 'hidden' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4 },
})
