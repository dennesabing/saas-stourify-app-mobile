import { useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { useDatabase } from '@nozbe/watermelondb/react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { HomeStackParamList } from '@/shared/navigation/types'
import { Button, KeyboardAwareScreen, Text } from '@/shared/components/ui'
import { createLocalReview } from '@/features/reviews/api/createLocalReview'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<HomeStackParamList, 'WriteReview'>

const STAR_LABELS = [1, 2, 3, 4, 5] as const

/**
 * Rating + body, **local write only** (`createLocalReview`) — no spinner, no
 * network error path, because a local write cannot fail for network reasons.
 * On save it navigates back immediately; the row appears in `ReviewsScreen`
 * queued, the instant WatermelonDB's observer fires.
 */
export default function WriteReviewScreen({ route, navigation }: Props) {
  const { spotId } = route.params
  const theme = useTheme()
  const database = useDatabase()

  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

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
    <KeyboardAwareScreen edges={['top']} contentContainerStyle={{ gap: theme.spacing[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => navigation.goBack()}
          style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}
        >
          <Text variant="body" color="primary">
            ← Back
          </Text>
        </Pressable>
        <Text variant="h1">Write a review</Text>
      </View>

      <Text variant="body" color="muted">
        Saved on this device straight away. It uploads itself when you are back online.
      </Text>

      <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
        {STAR_LABELS.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${value} stars`}
            accessibilityState={{ selected: rating >= value }}
            onPress={() => setRating(value)}
            style={{
              minWidth: theme.minTouchTarget,
              minHeight: theme.minTouchTarget,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="h1" style={{ color: rating >= value ? theme.colors.accent2 : theme.colors.hairline }}>
              ★
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={{
          minHeight: 120,
          textAlignVertical: 'top',
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.hairline,
          borderWidth: 1,
          borderRadius: theme.radius.button,
          padding: theme.spacing[4],
          color: theme.colors.ink,
          ...theme.typography.body,
        }}
        placeholder="Share what made this spot worth the trip"
        placeholderTextColor={theme.colors.muted}
        value={body}
        onChangeText={setBody}
        multiline
      />

      {error !== null ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}

      <Button label="Post review" onPress={onSave} />
    </KeyboardAwareScreen>
  )
}
