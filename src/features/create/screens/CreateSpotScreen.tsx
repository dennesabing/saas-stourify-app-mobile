import { useState } from 'react'
import { ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useDatabase } from '@nozbe/watermelondb/react'
import { Button, Text } from '@/shared/components/ui'
import type { CreateStackParamList } from '@/shared/navigation/types'
import { useAuthStore } from '@/shared/store/auth'
import { uuidv4 } from '@/shared/utils/uuid'
import { syncNow } from '@/sync/scheduler'
import type Spot from '@/db/models/Spot'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<CreateStackParamList, 'CreateSpot'>

/**
 * The offline-first vertical slice.
 *
 * It writes straight to WatermelonDB and NEVER to the network. There is
 * deliberately no loading state and no error state for the write: a local write
 * cannot fail for network reasons, so a spinner would be describing a risk that
 * does not exist. The drain happens in the background; `syncNow` is a nudge, not
 * a dependency — the spot is already durable when it returns.
 *
 * That inversion — the network is a background concern, not a screen concern —
 * is the pattern M3 copies for every other owned entity.
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

  const inputStyle = {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.hairline,
    borderWidth: 1,
    borderRadius: theme.radius.button,
    padding: theme.spacing[4],
    color: theme.colors.ink,
    minHeight: theme.minTouchTarget,
  }

  async function onSave(): Promise<void> {
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

    // The uuid is minted HERE, before the write. It is the row's identity and
    // the key the server resolves the push by, which is what makes a replayed
    // drain create nothing new.
    const uuid = uuidv4()
    const now = Date.now()

    await database.write(async () => {
      await database.get<Spot>('sto_spots').create((row: any) => {
        row._raw.id = uuid
        row._raw.uuid = uuid
        row._raw.user_id = userId === null ? null : Number(userId)
        row._raw.title = title.trim()
        row._raw.description = description.trim() === '' ? null : description.trim()
        row._raw.latitude = lat
        row._raw.longitude = lng
        row._raw.status = 'draft'
        row._raw.is_verified = false
        row._raw.reviews_count = 0
        row._raw.saves_count = 0
        row._raw.created_at = now
        row._raw.updated_at = now
      })
    })

    // A nudge, not a dependency: the row is already durable and will drain on
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

        {error !== null ? (
          <Text variant="caption" style={{ color: theme.colors.danger }}>
            {error}
          </Text>
        ) : null}

        <Button label="Save spot" onPress={onSave} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
})
