import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useDatabase } from '@nozbe/watermelondb/react'
import type PostDraft from '@/db/models/PostDraft'
import { Button, Card, EmptyState, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'
import { deleteDraft, observeDrafts } from '@/features/social/api/postDrafts'

interface Props {
  navigation: { navigate: (screen: string, params?: object) => void }
}

/**
 * Posts you started and have not shared (STOURIFY-159).
 *
 * Everything here is read from the phone's own database, so the screen works
 * with no signal at all — which is the point of it. It is registered in the
 * Profile stack and in the Create stack, the second one because the Profile
 * screen fetches a profile before it renders anything (STOURIFY-118).
 */
export default function DraftsScreen({ navigation }: Props) {
  const theme = useTheme()
  const database = useDatabase()

  const [drafts, setDrafts] = useState<PostDraft[]>([])
  /**
   * Whether the database has answered yet.
   *
   * Without it the screen says "Nothing here" for the instant before the first
   * read returns — the same thing STOURIFY-41 and its siblings were filed
   * against, and cheaper to get right now than to explain later.
   */
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const subscription = observeDrafts(database).subscribe((rows) => {
      setDrafts(rows)
      setLoaded(true)
    })
    return () => subscription.unsubscribe()
  }, [database])

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.surface }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.gutter, gap: theme.spacing[4] }}>
        <Text variant="h1">Drafts</Text>
        <Text variant="caption" color="muted">
          Posts you started. They are kept on this device, signal or no signal.
        </Text>

        {!loaded ? (
          <Text variant="caption" color="muted">
            Loading…
          </Text>
        ) : null}

        {loaded && drafts.length === 0 ? (
          <EmptyState
            icon="📝"
            title="No drafts"
            subtitle="Start a post and step away from it — whatever you had written will be waiting here."
          />
        ) : null}

        {drafts.map((draft) => (
          <Card key={draft.id} style={styles.card}>
            <View style={{ gap: theme.spacing[3] }}>
              {draft.media[0] ? (
                <Image
                  source={{ uri: draft.media[0].uri }}
                  style={[styles.thumbnail, { borderRadius: theme.radius.button }]}
                  contentFit="cover"
                  accessibilityLabel="Draft photo"
                />
              ) : null}

              <Text variant="body" numberOfLines={2}>
                {draft.caption.trim() === '' ? 'No caption yet' : draft.caption}
              </Text>

              {draft.spotTitle !== null ? (
                <Text variant="caption" color="muted">{`📍 ${draft.spotTitle}`}</Text>
              ) : null}

              <Text variant="caption" color="muted">
                {`Last edited ${new Date(draft.updatedAt).toLocaleString()}`}
              </Text>

              <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
                <Button
                  label="Continue"
                  onPress={() => navigation.navigate('PostCompose', { draftId: draft.id })}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Delete"
                  variant="secondary"
                  accessibilityLabel={`Delete draft: ${draft.caption.trim() === '' ? 'no caption yet' : draft.caption}`}
                  onPress={() => {
                    void deleteDraft(database, draft.id)
                  }}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { padding: 12 },
  thumbnail: { width: '100%', height: 160 },
})
