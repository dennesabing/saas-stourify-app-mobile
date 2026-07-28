import { useEffect, useState } from 'react'
import { useDatabase } from '@nozbe/watermelondb/react'
import {
  listFailedQueue,
  listPendingQueue,
  QUEUE_TABLES,
  type FailedQueueRow,
  type PendingQueueRow,
} from './queue'

export interface SyncQueue {
  pending: PendingQueueRow[]
  failed: FailedQueueRow[]
}

const EMPTY: SyncQueue = { pending: [], failed: [] }

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
      void Promise.all([listPendingQueue(database), listFailedQueue(database)]).then(
        ([pending, failed]) => {
          if (cancelled) return
          setQueue({ pending, failed })
        },
      )
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [database])

  return queue
}
