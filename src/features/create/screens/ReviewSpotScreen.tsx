import { useEffect, useState } from 'react'
import { Image, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useDatabase } from '@nozbe/watermelondb/react'
import { BarHeader, Button, Icon, Tag, Text } from '@/shared/components/ui'
import type { CreateStackParamList } from '@/shared/navigation/types'
import { useAuthStore } from '@/shared/store/auth'
import { syncNow } from '@/sync/scheduler'
import type PendingMedia from '@/db/models/PendingMedia'
import { observeDraftMedia } from '@/features/media/api/draftMedia'
import { publishSpot } from '@/features/create/api/publishSpot'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<CreateStackParamList, 'ReviewSpot'>

/** The design's cover height on the preview card. */
const COVER_HEIGHT = 200

/**
 * Review & Publish — the last create step, and the only one that writes
 * (STOURIFY-257, artboard 6 of the Create design).
 *
 * It shows the spot the way others will see it, then writes it straight to
 * WatermelonDB and NEVER to the network. There is deliberately no loading
 * state for the write: a local write cannot fail for network reasons, so a
 * spinner would be describing a risk that does not exist. `syncNow` is a
 * nudge, not a dependency — the spot and its photos are already durable when
 * it returns.
 *
 * That is also why the offline note is always shown, not only when there is no
 * signal. It describes how publishing works every time, not a fallback.
 *
 * Left out of the artboard on purpose: the Public / Followers / Private switch
 * (a spot has no visibility field) and "Add to collection" (collections are
 * after the beta).
 */
export default function ReviewSpotScreen({ navigation, route }: Props) {
  const theme = useTheme()
  const database = useDatabase()
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const { title, description, categories, coordinate } = route.params

  const [photos, setPhotos] = useState<PendingMedia[]>([])
  const [error, setError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    const subscription = observeDraftMedia(database).subscribe(setPhotos)
    return () => subscription.unsubscribe()
  }, [database])

  const cover = photos[0] ?? null
  const trimmedDescription = description.trim()

  async function onPublish(): Promise<void> {
    if (publishing) return

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
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
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

    // Reset rather than navigate. With a plain navigate, Back from My Spots
    // lands on this screen again with Publish still under the thumb, and a
    // second press writes a second copy of the spot.
    navigation.reset({ index: 1, routes: [{ name: 'CreateMenu' }, { name: 'MySpots' }] })
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <BarHeader title="Review" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.gutter,
          paddingTop: 2,
          paddingBottom: theme.spacing[4],
          gap: theme.spacing[4],
        }}
      >
        <View
          testID="review-preview"
          style={[
            theme.elevation.raised,
            {
              borderRadius: theme.radius.card,
              borderWidth: 1,
              borderColor: theme.colors.hairline,
              backgroundColor: theme.colors.card,
            },
          ]}
        >
          {/* Clipped in its own box: `overflow: hidden` on the card would clip its shadow. */}
          <View style={{ borderRadius: theme.radius.card, overflow: 'hidden' }}>
            <View style={{ height: COVER_HEIGHT, backgroundColor: theme.colors.surfaceAlt }}>
              {cover !== null ? (
                <Image
                  testID="review-cover"
                  source={{ uri: cover.localPath }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.centered]}>
                  <Icon name="pin" size={36} color="muted" />
                </View>
              )}

              <View
                style={[
                  styles.pill,
                  {
                    top: theme.spacing[3],
                    left: theme.spacing[3],
                    gap: 5,
                    paddingHorizontal: 11,
                    paddingVertical: 6,
                    borderRadius: theme.radius.chip,
                    backgroundColor: theme.colors.card,
                  },
                ]}
              >
                <Icon name="pin" size={12} />
                <Text variant="caption" style={{ fontFamily: theme.fontFamily.bodySemiBold }}>
                  {`${coordinate.latitude.toFixed(4)}, ${coordinate.longitude.toFixed(4)}`}
                </Text>
              </View>
            </View>

            <View style={{ paddingHorizontal: 15, paddingVertical: 13, gap: theme.spacing[1] }}>
              {categories.length > 0 ? (
                <View style={[styles.tags, { marginBottom: theme.spacing[1] }]}>
                  {categories.map((category) => (
                    <Tag key={category} label={category} />
                  ))}
                </View>
              ) : null}

              <Text variant="h2">{title.trim()}</Text>

              {trimmedDescription !== '' ? (
                <Text variant="body" color="muted">
                  {trimmedDescription}
                </Text>
              ) : null}

              {photos.length > 1 ? (
                <Text variant="caption" color="muted">
                  {`${photos.length} photos`}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View
          style={[
            styles.row,
            {
              gap: 9,
              paddingHorizontal: 13,
              paddingVertical: 11,
              borderRadius: theme.radius.button,
              borderWidth: 1,
              // The design's accent-2 tint, derived from the token rather than
              // written as a literal: 8-digit hex is the token plus an alpha.
              backgroundColor: `${theme.colors.accent2}1A`,
              borderColor: `${theme.colors.accent2}4D`,
            },
          ]}
        >
          <Icon name="sync" size={17} color="accent2" />
          <Text variant="caption" color="badgeInk" style={styles.fill}>
            Saved offline first. It publishes automatically when you are back online.
          </Text>
        </View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: theme.gutter,
          paddingTop: theme.spacing[3],
          paddingBottom: theme.spacing[4],
          gap: theme.spacing[2],
        }}
      >
        {error !== null ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}

        <Button
          label="Publish spot"
          size="lg"
          onPress={() => {
            void onPublish()
          }}
          disabled={publishing}
          fullWidth
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  pill: { position: 'absolute', flexDirection: 'row', alignItems: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
})
