import { useCallback, useEffect, useRef, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useDatabase } from '@nozbe/watermelondb/react'
import { BarHeader, Button, Chip, Icon, Text, useKeyboardOverlap } from '@/shared/components/ui'
import type { CreateStackParamList } from '@/shared/navigation/types'
import type { MapCoordinate } from '@/shared/map'
import type PendingMedia from '@/db/models/PendingMedia'
import { MAX_DRAFT_PHOTOS, observeDraftMedia } from '@/features/media/api/draftMedia'
import { MAX_SPOT_CATEGORIES, validateSpotForm } from '@/features/create/api/spotForm'
import {
  useInitialPosition,
  type InitialPositionStatus,
} from '@/features/create/api/useInitialPosition'
import { SPOT_CATEGORIES } from '@/shared/config/spotCategories'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<CreateStackParamList, 'CreateSpot'>

/** The design's photo tile. Three photos and the add tile fit one row. */
const TILE = 76

/**
 * New Spot — the first of three create steps: this form, then the full-screen
 * pin (`SpotLocationScreen`), then `ReviewSpotScreen`, which is the only one
 * that writes anything (STOURIFY-257, artboard 4 of the Create design).
 *
 * This screen holds the form and checks it. It never writes: a spot is saved
 * on Review, straight to WatermelonDB and never to the network, for the reasons
 * `ReviewSpotScreen` and `publishSpot` give.
 *
 * **Location is captured, never typed** (STOURIFY-4). The phone is asked where
 * it is the moment the form opens, and the answer lands in the location row
 * with a tick. Tapping the row opens the full-screen map to correct it, and
 * "Confirm location" hands the corrected pin back here as a route param. There
 * is still no way to type a coordinate anywhere in the flow.
 *
 * The photo strip reads the database rather than a route param, for the reason
 * `CreateStackParamList` spells out: a camera URI is an OS cache entry Android
 * may reclaim (design spec §2.3 rule 4).
 *
 * Left out of the artboard on purpose, because nothing stands behind them yet:
 * "Save draft" (the operator ruled out drafts on 2026-08-26) and the operating
 * hours row (no hours editor exists).
 */
export default function CreateSpotScreen({ navigation, route }: Props) {
  const theme = useTheme()
  const database = useDatabase()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  // Never typed: filled in from the device on entry, corrected on the map.
  // `null` means nothing has placed it yet, which validation refuses.
  const [coordinate, setCoordinate] = useState<MapCoordinate | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [photos, setPhotos] = useState<PendingMedia[]>([])

  // A late fix never overwrites a pin somebody has already placed by hand.
  const onFix = useCallback((fix: MapCoordinate) => {
    setCoordinate((current) => current ?? fix)
    // STOURIFY-257: a pin landing here can turn an invalid form valid, so the
    // stale "needs a location" line must not outlive it.
    setError(null)
  }, [])
  const locating = useInitialPosition(onFix)

  // The corrected pin, handed back by "Confirm location".
  const returned = route.params?.coordinate
  useEffect(() => {
    if (returned) {
      setCoordinate(returned)
      // STOURIFY-257: same reasoning as `onFix` — this is the other path a
      // coordinate can arrive by.
      setError(null)
    }
  }, [returned])

  useEffect(() => {
    // Subscribe rather than refetch on focus: a photo removed on the review
    // step has to update this strip, and a focus-driven refetch would miss a
    // change made while this screen was already mounted underneath it.
    const subscription = observeDraftMedia(database).subscribe(setPhotos)
    return () => subscription.unsubscribe()
  }, [database])

  // The pinned footer below rides on top of this — see the hook's own comment
  // for why it measures the wrapper's absolute position rather than trusting
  // `KeyboardAvoidingView`'s parent-relative `onLayout` frame (STOURIFY-257).
  const wrapperRef = useRef<View>(null)
  const keyboardOverlap = useKeyboardOverlap(wrapperRef)

  const atCap = photos.length >= MAX_DRAFT_PHOTOS

  const inputStyle = {
    ...theme.typography.body,
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.hairline,
    borderWidth: 1,
    borderRadius: theme.radius.button,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: theme.colors.ink,
    minHeight: theme.minTouchTarget,
  }

  function toggleCategory(category: string): void {
    setCategories((previous) =>
      previous.includes(category)
        ? previous.filter((existing) => existing !== category)
        : previous.length >= MAX_SPOT_CATEGORIES
          ? previous
          : [...previous, category],
    )
    // STOURIFY-257: a chip toggle is a field the error line can be about.
    setError(null)
  }

  // STOURIFY-257: title and description each feed `validateSpotForm`, so
  // every keystroke can be the one that makes a shown error stale.
  function onChangeTitle(value: string): void {
    setTitle(value)
    setError(null)
  }

  function onChangeDescription(value: string): void {
    setDescription(value)
    setError(null)
  }

  function onNext(): void {
    // One rule set, shared with its own tests and kept in step with
    // `SpotStoreRequest`. Checked here, before Review, so the person is still
    // looking at the field that is wrong when they are told about it.
    const invalid = validateSpotForm({ title, description, coordinate, categories })

    if (invalid !== null) {
      setError(invalid)
      return
    }

    setError(null)
    navigation.navigate('ReviewSpot', {
      title,
      description,
      categories,
      // Non-null by construction: `validateSpotForm` refuses a form with none.
      coordinate: coordinate!,
    })
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <BarHeader title="New Spot" onBack={() => navigation.goBack()} />

      <View ref={wrapperRef} style={styles.fill}>
        {/*
          `keyboardShouldPersistTaps="handled"` is not cosmetic: without it the
          first tap on a chip or the location row below a focused field is spent
          dismissing the keyboard (STOURIFY-100).
        */}
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: theme.gutter,
            paddingTop: 6,
            paddingBottom: theme.spacing[4],
            gap: 15,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={{ gap: theme.spacing[2] }}>
            <View style={styles.strip}>
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
                      styles.tile,
                      {
                        borderRadius: theme.radius.button,
                        backgroundColor: theme.colors.surfaceAlt,
                      },
                    ]}
                    resizeMode="cover"
                  />
                </Pressable>
              ))}

              {/* Disabled rather than hidden at the cap, so the strip keeps its shape. */}
              <Pressable
                onPress={() => navigation.navigate('CameraCapture')}
                disabled={atCap}
                accessibilityRole="button"
                accessibilityLabel="Add photos"
                accessibilityState={{ disabled: atCap }}
                style={({ pressed }) => [
                  styles.tile,
                  styles.centered,
                  {
                    borderRadius: theme.radius.button,
                    borderWidth: 1.5,
                    borderStyle: 'dashed',
                    borderColor: theme.colors.hairline,
                    backgroundColor: theme.colors.surfaceAlt,
                    opacity: atCap ? 0.5 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Icon name="add" size={24} color="muted" />
              </Pressable>
            </View>

            {atCap ? (
              <Text variant="caption" color="muted">
                {`That is all ${MAX_DRAFT_PHOTOS} photos. Remove one to take another.`}
              </Text>
            ) : null}
          </View>

          <View>
            <FieldLabel>Title</FieldLabel>
            <TextInput
              style={inputStyle}
              placeholder="Spot name"
              placeholderTextColor={theme.colors.muted}
              accessibilityLabel="Title"
              value={title}
              onChangeText={onChangeTitle}
            />
          </View>

          <View>
            <FieldLabel>Description</FieldLabel>
            <TextInput
              style={[inputStyle, styles.multiline]}
              placeholder="What makes it worth the trip?"
              placeholderTextColor={theme.colors.muted}
              accessibilityLabel="Description"
              value={description}
              onChangeText={onChangeDescription}
              multiline
            />
          </View>

          <View>
            <FieldLabel>Categories</FieldLabel>
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

          <Pressable
            onPress={() => navigation.navigate('SpotLocation', { coordinate })}
            accessibilityRole="button"
            accessibilityLabel="Location"
            accessibilityHint="Opens the map to place the pin"
            style={({ pressed }) => [
              styles.row,
              {
                minHeight: theme.minTouchTarget,
                gap: 11,
                padding: 14,
                borderRadius: theme.radius.button,
                borderWidth: 1,
                borderColor: theme.colors.hairline,
                backgroundColor: theme.colors.card,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Icon name="pin" size={18} color="primary" />
            <Text
              testID={coordinate ? 'picked-coordinates' : 'location-row-status'}
              variant="body"
              color={coordinate ? 'ink' : 'muted'}
              numberOfLines={1}
              style={[styles.fill, { fontFamily: theme.fontFamily.bodyMedium }]}
            >
              {locationLine(coordinate, locating)}
            </Text>
            {coordinate ? (
              <Icon name="check" size={16} color="success" strokeWidth={2.5} />
            ) : (
              <Icon name="forward" size={18} color="muted" />
            )}
          </Pressable>
        </ScrollView>

        <View
          testID="create-spot-footer"
          style={{
            paddingHorizontal: theme.gutter,
            paddingTop: theme.spacing[3],
            // How much of the wrapper above the keyboard actually covers,
            // added on top of the resting padding — this is what lifts the
            // footer to rest right on the keyboard rather than sitting under
            // it, or floating above it (STOURIFY-257). Adding to the footer,
            // not the screen, keeps the maths to one number: the footer just
            // grows and the `ScrollView` above it gives up exactly that much
            // room.
            paddingBottom: theme.spacing[4] + keyboardOverlap,
            gap: theme.spacing[2],
            backgroundColor: theme.colors.surface,
          }}
        >
          {/* Above the button, so a refusal is read where the finger already is. */}
          {error !== null ? (
            <Text variant="caption" color="danger">
              {error}
            </Text>
          ) : null}

          <Button label="Next · Review & Publish" size="lg" onPress={onNext} fullWidth />
        </View>
      </View>
    </SafeAreaView>
  )
}

/** The design's `.fl`: a small uppercase label over each field. */
function FieldLabel({ children }: { children: string }) {
  return (
    <Text variant="micro" color="muted" style={styles.label}>
      {children}
    </Text>
  )
}

/**
 * What the location row says. Coordinates once there are any — there is no
 * place-name lookup yet, and a lookup would need the network this flow must
 * not depend on — otherwise the state, in words that say what a tap will do.
 */
function locationLine(coordinate: MapCoordinate | null, status: InitialPositionStatus): string {
  if (coordinate !== null) {
    return `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`
  }

  switch (status) {
    case 'locating':
      return 'Finding where you are…'
    case 'denied':
      return 'Location is off. Tap to place the pin'
    case 'ready':
    case 'unavailable':
      return 'Tap to place the pin on the map'
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  strip: { flexDirection: 'row', gap: 9 },
  tile: { width: TILE, height: TILE },
  centered: { alignItems: 'center', justifyContent: 'center' },
  label: { marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center' },
})
