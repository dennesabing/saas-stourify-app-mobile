import { Alert, Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useDatabase } from '@nozbe/watermelondb/react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, EmptyState, Text } from '@/shared/components/ui'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import { discardRecord, retryAllFailures, retryRecord } from '@/sync/queue'
import { syncNow } from '@/sync/scheduler'
import { useSyncQueue } from '@/sync/useSyncQueue'
import { useSyncStatusStore } from '@/sync/status'
import { useTheme } from '@/theme/ThemeProvider'
import SyncBanner from '../components/SyncBanner'
import SyncQueueRow from '../components/SyncQueueRow'

type Props = NativeStackScreenProps<ProfileStackParamList, 'SyncStatus'>

/**
 * The offline-first app's honesty surface.
 *
 * Queue rows come from the database (`useSyncQueue`), never from
 * `useSyncStatusStore.pendingCount` — that counter is only written inside a sync
 * cycle, so an offline write would leave this screen claiming everything is
 * synced while unsent rows sit in the outbox. Cycle state (phase, offline,
 * lastSyncedAt) does come from the store, because only the cycle knows it.
 */
export default function SyncStatusScreen({ navigation }: Props) {
  const theme = useTheme()
  const database = useDatabase()
  const { pending, failed } = useSyncQueue()
  const phase = useSyncStatusStore((state) => state.phase)

  const isBusy = phase !== 'idle'
  const hasQueue = pending.length > 0 || failed.length > 0

  const handleRetry = async (recordId: string) => {
    await retryRecord(database, recordId)
    await syncNow(database, 'manual')
  }

  const handleDiscard = (tableName: string, recordId: string, title: string) => {
    Alert.alert(
      'Discard this change?',
      'This permanently deletes it from this device. It was never saved to the server, so it cannot be recovered.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await discardRecord(database, tableName, recordId)
              // The gate may now be clear, and "I fixed it, sync now" is the
              // user's mental model.
              await syncNow(database, 'manual')
            })()
          },
        },
      ],
      { cancelable: true },
    )
    void title
  }

  const handleRetryAll = async () => {
    await retryAllFailures(database)
    await syncNow(database, 'manual')
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[3],
          paddingHorizontal: theme.gutter,
          paddingVertical: theme.spacing[3],
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back to Settings"
          hitSlop={12}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
        >
          <Text variant="h2" color="primary">
            ‹
          </Text>
        </Pressable>
        <Text variant="h1">Sync status</Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.gutter,
          paddingBottom: theme.spacing[8],
          gap: theme.spacing[4],
        }}
      >
        <SyncBanner pending={pending.length} failed={failed.length} />

        {failed.length > 0 ? (
          <View style={{ gap: theme.spacing[3] }}>
            <Text variant="micro" color="muted">
              Needs your attention
            </Text>
            {failed.map((row) => (
              <SyncQueueRow
                key={`failed-${row.tableName}-${row.id}`}
                variant="failed"
                row={row}
                onRetry={() => void handleRetry(row.id)}
                onDiscard={() => handleDiscard(row.tableName, row.id, row.title)}
              />
            ))}
          </View>
        ) : null}

        {pending.length > 0 ? (
          <View style={{ gap: theme.spacing[3] }}>
            <Text variant="micro" color="muted">
              Pending uploads
            </Text>
            {pending.map((row) => (
              <SyncQueueRow key={`pending-${row.tableName}-${row.id}`} variant="pending" row={row} />
            ))}
          </View>
        ) : null}

        {hasQueue ? null : (
          <EmptyState
            icon="✅"
            title="Everything is synced"
            subtitle="Changes you make offline will appear here until they reach the server."
          />
        )}
      </ScrollView>

      {hasQueue ? (
        <View
          style={{
            padding: theme.gutter,
            borderTopWidth: 1,
            borderTopColor: theme.colors.hairline,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Button
            label="Retry all now"
            fullWidth
            size="lg"
            loading={isBusy}
            disabled={isBusy}
            onPress={() => void handleRetryAll()}
          />
        </View>
      ) : null}
    </SafeAreaView>
  )
}
