import { useEffect, useState } from 'react'
import { useDatabase } from '@nozbe/watermelondb/react'
import {
  listFailedMediaQueue,
  listFailedPostQueue,
  listFailedQueue,
  listPendingMediaQueue,
  listPendingPostQueue,
  listPendingQueue,
  QUEUE_TABLES,
  type FailedQueueRow,
  type PendingQueueRow,
} from './queue'

export interface SyncQueue {
  pending: PendingQueueRow[]
  failed: FailedQueueRow[]
  /**
   * `pending_media` rows — its own section on the Sync Status screen (design
   * spec §2.4), never merged into `pending`/`failed`: a photo isn't a row
   * edit and never participates in the skip-pull gate `pending`/`failed` here
   * are downstream of.
   */
  mediaPending: PendingQueueRow[]
  mediaFailed: FailedQueueRow[]
  /**
   * `post_outbox` rows — posts somebody pressed Share on with no signal
   * (STOURIFY-161). Its own section for the same reason the photos have one: a
   * queued post is not a row edit and never participates in the skip-pull gate.
   */
  postPending: PendingQueueRow[]
  postFailed: FailedQueueRow[]
}

const EMPTY: SyncQueue = {
  pending: [],
  failed: [],
  mediaPending: [],
  mediaFailed: [],
  postPending: [],
  postFailed: [],
}

/**
 * The live queue, straight from the database.
 *
 * `withChangesForTables` — not `observe()` and not `observeWithColumns()`. Both
 * of those re-emit only when the matching SET changes or a listed SCHEMA column
 * changes value, and `_status` is neither: a push ack flips `created` → `synced`
 * without touching a column, so the row would sit in the queue forever
 * (`useMySpots.ts:19-27` documents the same trap).
 *
 * Rows are plain snapshots, not model instances, so `FlatList`'s per-cell
 * memoization actually sees a change.
 */
export function useSyncQueue(): SyncQueue {
  const database = useDatabase()
  const [queue, setQueue] = useState<SyncQueue>(EMPTY)

  useEffect(() => {
    let cancelled = false

    const subscription = database.withChangesForTables([...QUEUE_TABLES]).subscribe(() => {
      void Promise.all([
        listPendingQueue(database),
        listFailedQueue(database),
        listPendingMediaQueue(database),
        listFailedMediaQueue(database),
        listPendingPostQueue(database),
        listFailedPostQueue(database),
      ]).then(([pending, failed, mediaPending, mediaFailed, postPending, postFailed]) => {
        if (cancelled) return
        setQueue({ pending, failed, mediaPending, mediaFailed, postPending, postFailed })
      })
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [database])

  return queue
}
