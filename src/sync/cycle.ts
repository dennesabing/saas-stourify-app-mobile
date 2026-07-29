import { Q, type Database } from '@nozbe/watermelondb'
import type { HttpClient } from '@soxerp/offline-sync-core'
import type PendingMedia from '@/db/models/PendingMedia'
import { createStourifySyncEngine } from './engine'
import { syncHttpClient } from './httpClient'
import { drainPendingMedia } from './mediaDrain'
import { countPending, drainOutbox, listSyncFailures, type DrainOutcome } from './pushService'
import { useSyncStatusStore } from './status'

export type SyncTrigger = 'connectivity' | 'foreground' | 'login' | 'manual'

export interface SyncCycleOutcome {
  trigger: SyncTrigger
  /** `'in-flight'` when another cycle already held the mutex; the call is a no-op. */
  skipped: 'in-flight' | null
  drain: DrainOutcome
  pulled: boolean
  pulledRows: number
  error: unknown | null
}

const IDLE_DRAIN: DrainOutcome = {
  attempted: 0,
  acked: 0,
  rejected: 0,
  excluded: 0,
  fullyAcked: true,
  networkFailure: false,
  error: null,
}

/**
 * The engine has NO concurrency guard — `runPullSync()` iterates modules and
 * writes with no lock (`syncEngine.ts:84-92`), so two overlapping calls
 * interleave writes into the same collections. This module-level latch is the
 * guard.
 */
let inFlight = false

export function isSyncInFlight(): boolean {
  return inFlight
}

async function publishQueueState(database: Database): Promise<void> {
  useSyncStatusStore.getState().setPendingCount(await countPending(database))
  useSyncStatusStore.getState().setFailures(await listSyncFailures(database))
}

async function publishMediaState(database: Database): Promise<void> {
  const pendingMediaCount = await database
    .get<PendingMedia>('pending_media')
    .query(Q.where('state', 'pending'))
    .fetchCount()

  const failedRows = await database
    .get<PendingMedia>('pending_media')
    .query(Q.where('state', 'failed'))
    .fetch()

  useSyncStatusStore.getState().setPendingMediaCount(pendingMediaCount)
  useSyncStatusStore.getState().setMediaFailures(
    failedRows.map((row) => ({
      id: row.id,
      filename: row.filename,
      attempts: row.attempts,
      lastError: row.lastError ?? '',
    })),
  )
}

/**
 * One cycle: **drain outbox → gate check → pull delta**. The order is never
 * reversed.
 *
 * The gate is the most important rule in this layer. The engine applies a delta
 * with unconditional server-wins — `Object.assign(r._raw, { ...fields, id })`
 * over whatever is there (`syncEngine.ts:54-57`) and `destroyPermanently()` for
 * every deleted uuid (`syncEngine.ts:32-39`) — and has no notion of a
 * locally-dirty row. A pull that runs while an unpushed local edit exists
 * silently destroys that edit: no error, no conflict, no log line.
 *
 * So: if the drain leaves ANYTHING un-acked, skip the pull. The cursor is
 * untouched (it is only written after a successful `pullModule`,
 * `syncEngine.ts:80`), so the next cycle retries from the same point with
 * nothing lost. The cost is that one permanently-rejected row stalls all
 * incoming data until the user resolves or discards it — which is exactly what
 * the M2c Sync Status screen exists to surface. Staleness is bounded by the
 * retry cadence; data loss is bounded by zero.
 */
export async function runSyncCycle(options: {
  database: Database
  client?: HttpClient
  trigger: SyncTrigger
}): Promise<SyncCycleOutcome> {
  if (inFlight) {
    return { trigger: options.trigger, skipped: 'in-flight', drain: IDLE_DRAIN, pulled: false, pulledRows: 0, error: null }
  }

  inFlight = true
  const client = options.client ?? syncHttpClient
  const status = useSyncStatusStore.getState()

  try {
    status.setPhase('draining')
    const drain = await drainOutbox(options.database, client)
    await publishQueueState(options.database)

    // A drain that reaches the server at all — success or a non-network
    // rejection — is itself proof of connectivity, independent of what the
    // gate below then decides. Only a network failure may SET `offline`;
    // anything else, including a gate trip on a validation/forbidden
    // rejection, must CLEAR a stale `true` left by an earlier cycle.
    status.setOffline(drain.networkFailure)
    if (drain.error !== null && !drain.networkFailure) {
      status.setLastError(drain.error instanceof Error ? drain.error.message : String(drain.error))
    }

    if (!drain.fullyAcked) {
      return { trigger: options.trigger, skipped: null, drain, pulled: false, pulledRows: 0, error: drain.error }
    }

    status.setPhase('pulling')
    const observed = await createStourifySyncEngine(options.database, client).runPullSync()

    if (observed.networkFailure) status.setOffline(true)
    else status.setOffline(false)

    if (observed.error !== null) {
      // Mirrors the drain-side guard above: a network failure must never
      // surface as a user-visible `lastError` — only a non-network pull error
      // should. `setOffline(true)` a few lines up already recorded the real
      // cause.
      if (!observed.networkFailure) {
        status.setLastError(observed.error instanceof Error ? observed.error.message : String(observed.error))
      }
      return { trigger: options.trigger, skipped: null, drain, pulled: false, pulledRows: 0, error: observed.error }
    }

    status.recordPull(observed.rows)
    status.markSynced(Date.now())
    await publishQueueState(options.database)

    // Phase 2, AFTER the pull, OUTSIDE the gate. This must never be moved
    // ahead of the `return` below or folded into `drain`/`fullyAcked`: a
    // pending photo is not a row edit, no incoming delta can destroy it, and
    // wiring it into the gate would resurrect the exact indefinite stall
    // M2c's Sync Status screen exists to escape (design spec §2.3 rule 3). A
    // failure here — network or a rejected attach — is swallowed and
    // surfaced only through `publishMediaState`, never through this cycle's
    // `error`/`pulled` outcome.
    try {
      await drainPendingMedia(options.database)
    } catch {
      // A local read/write failure inside the media drain is still not
      // allowed to make this cycle look like it failed to pull.
    }
    await publishMediaState(options.database)

    return { trigger: options.trigger, skipped: null, drain, pulled: true, pulledRows: observed.rows, error: null }
  } finally {
    // Idempotent, and covers every exit path — including an uncaught
    // exception from `drainOutbox`/`publishQueueState` (e.g. a local DB read
    // failure that is not one of the handled network-failure cases). Without
    // this in `finally`, such an error frees the mutex but leaves `phase`
    // stuck at `'draining'`/`'pulling'` until some later cycle happens to
    // overwrite it — the UI would show a sync in progress indefinitely.
    status.setPhase('idle')
    inFlight = false
  }
}
