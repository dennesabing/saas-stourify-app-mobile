import { useEffect } from 'react'
import { Alert, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useDatabase } from '@nozbe/watermelondb/react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { BarHeader, Button, Text } from '@/shared/components/ui'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import {
  discardMediaRow,
  discardRecord,
  retryAllFailures,
  retryMediaRow,
  retryRecord,
} from '@/sync/queue'
import { syncOnScreenOpen } from '@/sync/openTrigger'
import { syncNow } from '@/sync/scheduler'
import { useSyncQueue } from '@/sync/useSyncQueue'
import { useSyncStatusStore } from '@/sync/status'
import { useTheme } from '@/theme/ThemeProvider'
import { discardQueuedPost, retryQueuedPost } from '@/features/social/api/postOutbox'
import SyncBanner from '../components/SyncBanner'
import SyncQueueRow from '../components/SyncQueueRow'

/** `pending_media`'s `tableName` is always this — never one of `PUSHABLE_TABLES`. */
const MEDIA_TABLE = 'pending_media'

/**
 * `post_outbox`'s `tableName`, likewise. Three kinds of queued work reach this
 * screen through one row component, and this constant plus `MEDIA_TABLE` is how
 * a press is routed to the right pair of handlers (STOURIFY-161).
 */
const POST_OUTBOX_TABLE = 'post_outbox'

type Props = NativeStackScreenProps<ProfileStackParamList, 'SyncStatus'>

/**
 * The offline-first app's honesty surface, drawn as artboard 2 of the Offline &
 * Sync design (STOURIFY-294): a banner that leads with the count, then every
 * change on its way in one list a person can read.
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
  const { pending, failed, mediaPending, mediaFailed, postPending, postFailed } = useSyncQueue()
  const phase = useSyncStatusStore((state) => state.phase)

  /*
    Opening this screen is itself a request to try again (STOURIFY-179).

    Somebody who comes here is doing what a driver does when they walk out to
    check the van: they already suspect something has not gone. Before this, the
    screen only reported — it would show a stalled queue for as long as anyone
    stared at it.

    Mount rather than navigation focus, deliberately: this screen is a leaf that
    opens nothing on top of itself, so a pop unmounts it and "mounted" and
    "opened" are the same event here. `syncOnScreenOpen` owns the cooling-off
    window that stops a flick back and forth becoming a burst of requests.
  */
  useEffect(() => {
    void syncOnScreenOpen(database)
  }, [database])

  /*
    THE BANNER COUNTS EXACTLY WHAT THIS SCREEN LISTS (STOURIFY-165).

    A till receipt that leaves items off: every line on it is true, and the
    total is wrong — and the total is the line people read. The banner has
    twice said "Nothing waiting to send" directly above something that was:
    once for posts (STOURIFY-161), then again for photos, because the instance
    was fixed rather than the class.

    Since STOURIFY-294 the class is fixed by construction: the six queues are
    folded into the two lists below, and the banner is handed those lists'
    lengths. A seventh queue has to join one of them to appear on screen at
    all, and joining it is what counts it.
  */
  const attention = [...failed, ...postFailed, ...mediaFailed]
  const waiting = [...pending, ...postPending, ...mediaPending]

  const isBusy = phase !== 'idle'
  const hasQueue = attention.length > 0 || waiting.length > 0

  const handleRetry = async (tableName: string, recordId: string) => {
    if (tableName === MEDIA_TABLE) {
      await retryMediaRow(database, recordId)
    } else if (tableName === POST_OUTBOX_TABLE) {
      await retryQueuedPost(database, recordId)
    } else {
      await retryRecord(database, recordId)
    }
    await syncNow(database, 'manual')
  }

  const handleDiscard = (tableName: string, recordId: string) => {
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
              if (tableName === MEDIA_TABLE) {
                await discardMediaRow(database, recordId)
              } else if (tableName === POST_OUTBOX_TABLE) {
                await discardQueuedPost(database, recordId)
              } else {
                await discardRecord(database, tableName, recordId)
              }
              // The gate may now be clear, and "I fixed it, sync now" is the
              // user's mental model.
              await syncNow(database, 'manual')
            })()
          },
        },
      ],
      { cancelable: true },
    )
  }

  const handleRetryAll = async () => {
    await retryAllFailures(database)
    await syncNow(database, 'manual')
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      {/*
        The round back button says "Back", never "Back to Settings": since
        STOURIFY-118 this screen is also opened from the Create menu, so naming
        one caller would have a screen reader announce a destination the person
        is not going to.
      */}
      <BarHeader title="Sync status" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.gutter,
          paddingTop: theme.spacing[1],
          paddingBottom: theme.spacing[8],
          gap: theme.spacing[4],
        }}
      >
        <SyncBanner pending={waiting.length} failed={attention.length} />

        {attention.length > 0 ? (
          <View style={{ gap: 9 }}>
            <Text variant="micro" color="muted">
              Needs your attention
            </Text>
            {attention.map((row) => (
              <SyncQueueRow
                key={`failed-${row.tableName}-${row.id}`}
                variant="failed"
                row={row}
                onRetry={() => void handleRetry(row.tableName, row.id)}
                onDiscard={() => handleDiscard(row.tableName, row.id)}
              />
            ))}
          </View>
        ) : null}

        {waiting.length > 0 ? (
          <View style={{ gap: 9 }}>
            <Text variant="micro" color="muted">
              Pending uploads
            </Text>
            {waiting.map((row) => (
              <SyncQueueRow
                key={`pending-${row.tableName}-${row.id}`}
                variant="pending"
                row={row}
                // The one waiting row in the app that offers a way out, and
                // deliberately so — see `SyncQueueRow`'s own note. A post that
                // is on its way is going to be published; changing your mind
                // has to be possible before that, not only if it fails.
                onDiscard={
                  row.tableName === POST_OUTBOX_TABLE
                    ? () => handleDiscard(row.tableName, row.id)
                    : undefined
                }
              />
            ))}
          </View>
        ) : null}

        {hasQueue ? null : (
          <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
            Changes you make offline will appear here until they reach the server.
          </Text>
        )}
      </ScrollView>

      {hasQueue ? (
        <View
          style={{
            paddingHorizontal: theme.gutter,
            paddingTop: theme.spacing[3],
            paddingBottom: theme.spacing[5],
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
