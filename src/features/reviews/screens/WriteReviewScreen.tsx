import { useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { Image } from 'expo-image'
import { useDatabase } from '@nozbe/watermelondb/react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { HomeStackParamList } from '@/shared/navigation/types'
import { useQueryClient } from '@tanstack/react-query'
import type { Spot } from '@/shared/api/types'
import { BarHeader, Button, Icon, KeyboardAwareScreen, Text } from '@/shared/components/ui'
import { createLocalReview } from '@/features/reviews/api/createLocalReview'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<HomeStackParamList, 'WriteReview'>

const STAR_VALUES = [1, 2, 3, 4, 5] as const

/** What the chosen rating means, in words — the design twin's own list. Index 0 is "nothing yet". */
const RATING_WORDS = ['Tap to rate', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'] as const

/**
 * Rating + body, **local write only** (`createLocalReview`) — no spinner, no
 * network error path, because a local write cannot fail for network reasons.
 * On save it navigates back immediately; the row appears in `ReviewsScreen`
 * queued, the instant WatermelonDB's observer fires.
 *
 * Laid out as the Spot Hub design's Write Review artboard (STOURIFY-293): the
 * round back bar, the spot card, five large stars, the text box, the azure
 * note about posting with no signal, and "Post review" pinned at the bottom.
 * The artboard's "Add photos" is left out: a review cannot hold a photo.
 */
export default function WriteReviewScreen({ route, navigation }: Props) {
  const { spotId } = route.params

  /**
   * Which spot this review is for (STOURIFY-209).
   *
   * Read from the cache, and **deliberately never fetched**. This screen exists
   * to be usable with no signal — the review is written straight to the device
   * and sent later — so adding a request to it, even one whose failure is
   * harmless, is the wrong instinct on the one screen whose whole point is not
   * needing the network.
   *
   * Arriving from a spot page means the answer is already there, which is every
   * route into this screen today. Any other route simply gets no spot card, and
   * the form works exactly as before. A courtesy is not worth a request.
   */
  const spot = useQueryClient().getQueryData<Spot>(['spot', spotId])
  const theme = useTheme()
  const database = useDatabase()

  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  const thumb = spot?.media?.[0]?.thumb_url ?? spot?.media?.[0]?.url ?? null

  async function onSave(): Promise<void> {
    if (rating < 1) {
      setError('Choose a rating before posting.')
      return
    }

    setError(null)

    await createLocalReview(database, {
      spotId: null,
      spotUuid: spotId,
      rating,
      body: body.trim() === '' ? null : body.trim(),
    })

    navigation.goBack()
  }

  return (
    /*
      "Post review" stays pressable before a rating is chosen, where the canvas
      greys it out: pressed early it says "Choose a rating before posting.", and
      a button that is only grey never says why (see the ASSUMPTION on
      STOURIFY-293).
    */
    <KeyboardAwareScreen
      edges={['top', 'bottom']}
      contentContainerStyle={{ paddingHorizontal: theme.gutter, paddingTop: theme.spacing[1] }}
      header={
        <BarHeader
          testID="write-review-header"
          title="Write a review"
          onBack={() => navigation.goBack()}
        />
      }
      footer={
        <View style={{ paddingHorizontal: theme.gutter, paddingVertical: theme.spacing[3] }}>
          <Button label="Post review" fullWidth onPress={onSave} />
        </View>
      }
    >
      {spot ? (
        <View
          testID="write-review-spot"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 11,
            padding: 11,
            marginBottom: theme.spacing[4],
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.hairline,
            backgroundColor: theme.colors.card,
          }}
        >
          {thumb ? (
            <Image
              source={{ uri: thumb }}
              style={{
                width: 52,
                height: 52,
                borderRadius: 10,
                backgroundColor: theme.colors.surfaceAlt,
              }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.surfaceAlt,
              }}
            >
              <Icon name="pin" color="muted" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{ fontFamily: theme.fontFamily.displayBold, fontSize: 15, lineHeight: 20 }}
            >
              {spot.title}
            </Text>
            {spot.address ? (
              <Text variant="caption" color="muted" numberOfLines={2}>
                {spot.address}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      <Text variant="micro" color="muted" style={{ textAlign: 'center' }}>
        Your rating
      </Text>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          gap: theme.spacing[1],
          paddingTop: theme.spacing[2],
        }}
      >
        {STAR_VALUES.map((value) => {
          const on = rating >= value

          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${value} stars`}
              accessibilityState={{ selected: on }}
              onPress={() => setRating(value)}
              style={({ pressed }) => ({
                width: 52,
                height: 52,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: pressed ? 1.15 : 1 }],
              })}
            >
              {/* An outline on the empty stars, which the canvas does not draw,
                  so they still show on the dark theme's near-black page. */}
              <Icon
                name="star"
                size={40}
                strokeWidth={1.5}
                color={on ? 'accent2' : 'muted'}
                fill={on ? 'accent2' : 'surfaceAlt'}
              />
            </Pressable>
          )
        })}
      </View>

      <Text
        variant="caption"
        color="muted"
        style={{
          textAlign: 'center',
          fontFamily: theme.fontFamily.bodySemiBold,
          marginTop: theme.spacing[1],
          marginBottom: theme.spacing[4],
        }}
      >
        {RATING_WORDS[rating]}
      </Text>

      <Text variant="micro" color="muted" style={{ marginBottom: theme.spacing[2] }}>
        Your review
      </Text>
      <TextInput
        style={{
          minHeight: 120,
          textAlignVertical: 'top',
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.hairline,
          borderWidth: 1,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 13,
          color: theme.colors.ink,
          ...theme.typography.body,
        }}
        placeholder="Share your experience — what made this spot special?"
        placeholderTextColor={theme.colors.muted}
        value={body}
        onChangeText={setBody}
        multiline
      />

      {error !== null ? (
        <Text variant="caption" color="danger" style={{ marginTop: theme.spacing[2] }}>
          {error}
        </Text>
      ) : null}

      {/*
        The canvas's azure `.offline-note`. It is true, which is why it is here:
        `createLocalReview` writes to the synced `sto_reviews` table, and the
        sync engine posts it on reconnect.
      */}
      <View
        testID="write-review-offline-note"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
          marginTop: theme.spacing[4],
          paddingVertical: 11,
          paddingHorizontal: 13,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.infoLine,
          backgroundColor: theme.colors.infoBg,
        }}
      >
        <Icon name="sync" size={17} color="accent2" />
        <Text variant="caption" color="badgeInk" style={{ flex: 1 }}>
          No signal? Your review queues and posts automatically when you&apos;re back online.
        </Text>
      </View>
    </KeyboardAwareScreen>
  )
}
