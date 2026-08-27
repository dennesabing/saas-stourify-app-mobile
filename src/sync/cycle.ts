import { Q, type Database } from '@nozbe/watermelondb'
import type { HttpClient } from '@soxerp/offline-sync-core'
import type PendingMedia from '@/db/models/PendingMedia'
import { createStourifySyncEngine } from './engine'
import { syncHttpClient } from './httpClient'
import { drainPendingMedia } from './mediaDrain'
import { drainPostOutbox } from './postOutboxDrain'
import { countPending, drainOutbox, listSyncFailures, type DrainOutcome } from './pushService'
import { useSyncStatusStore } from './status'
import { syncTrace } from './trace'

/**
 * Why a cycle ran. Carried through to `SyncCycleOutcome` as a label — nothing
 * branches on it. `'screen-open'` is the Sync status screen being opened
 * (STOURIFY-179), which is a request to try again in its own right.
 */
export type SyncTrigger = 'connectivity' | 'foreground' | 'login' | 'manual' | 'screen-open'

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

/**
 * Bookkeeping for the trace, and for nothing else — no decision in this file
 * reads either of these.
 *
 * They exist so a turned-away cycle can say more than "somebody else is
 * running". A queue at a counter tells you nothing; a queue at a counter where
 * the person in front has been there forty minutes tells you the counter is
 * broken. `holderTrigger` and `holderSince` are what let the skip line carry
 * that second reading, which is the measurement STOURIFY-220 exists to take:
 * the leading explanation for the app going silent after a reconnect is a cycle
 * left over from the offline period, still waiting on a socket that will never
 * answer, and a large `held=` on the skip line is what that looks like.
 */
let holderTrigger: SyncTrigger | null = null
let holderSince = 0
let cycleCount = 0

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
 * Phase 2 of a cycle: upload every photo whose host row is already on the
 * server, then republish the media counters.
 *
 * Deliberately swallows everything. Phase 2 must be invisible to the cycle's
 * own outcome in both directions — it can neither make a failed cycle look
 * successful nor make a successful one look failed. The second direction is the
 * subtle one: this runs from `runSyncCycle`'s `finally`, and an exception
 * thrown there REPLACES whatever exception was already in flight. Without this
 * catch, a local database fault that broke the drain would surface as a media
 * error instead, sending the next reader to debug the wrong layer.
 */
async function runMediaPhase(database: Database): Promise<void> {
  try {
    await drainPendingMedia(database)
  } catch {
    // A local read/write failure inside the media drain is not this cycle's
    // business to report.
  }

  try {
    await publishMediaState(database)
  } catch {
    // Same again: the counters are a display convenience, never a gate.
  }
}

/**
 * Phase 3 of a cycle: send every post somebody pressed Share on with no signal
 * (STOURIFY-161).
 *
 * It sits here rather than anywhere earlier for the same two reasons the photo
 * phase does, and they point in opposite directions. Nothing above it may wait
 * on a post going out — so it is last. And no early return above it may jump
 * over it — so it is called from the `finally`, which the language guarantees
 * runs.
 *
 * It swallows everything, for the reason spelled out on `runMediaPhase`: an
 * exception thrown from a `finally` REPLACES whatever exception was already in
 * flight, so without this catch a local database fault here would surface as
 * the cycle's error and send the next reader to debug the wrong layer. Trouble
 * with a queued post shows up on the Sync status screen, never as this cycle's
 * outcome.
 */
async function runPostOutboxPhase(database: Database): Promise<void> {
  try {
    await drainPostOutbox(database)
  } catch {
    // Not this cycle's business to report.
  }
}

/**
 * One cycle: **drain outbox → gate check → pull delta → upload photos**. The
 * order is never reversed, and the last step runs whatever the first three did
 * — see the `finally` at the bottom for why that is not a detail.
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
    syncTrace(
      `cycle skip trigger=${options.trigger} reason=in-flight ` +
        `holder=${String(holderTrigger)} held=${Date.now() - holderSince}ms`,
    )

    return {
      trigger: options.trigger,
      skipped: 'in-flight',
      drain: IDLE_DRAIN,
      pulled: false,
      pulledRows: 0,
      error: null,
    }
  }

  inFlight = true
  holderTrigger = options.trigger
  holderSince = Date.now()
  const id = ++cycleCount
  const startedAt = holderSince
  syncTrace(`cycle#${id} enter trigger=${options.trigger}`)

  const client = options.client ?? syncHttpClient
  const status = useSyncStatusStore.getState()

  try {
    status.setPhase('draining')
    syncTrace(`cycle#${id} drain start`)
    const drain = await drainOutbox(options.database, client)
    syncTrace(
      `cycle#${id} drain done attempted=${drain.attempted} acked=${drain.acked} ` +
        `rejected=${drain.rejected} fullyAcked=${drain.fullyAcked} ` +
        `networkFailure=${drain.networkFailure}`,
    )
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
      syncTrace(`cycle#${id} exit reason=gate-not-fully-acked`)

      return {
        trigger: options.trigger,
        skipped: null,
        drain,
        pulled: false,
        pulledRows: 0,
        error: drain.error,
      }
    }

    status.setPhase('pulling')
    syncTrace(`cycle#${id} pull start`)
    const observed = await createStourifySyncEngine(options.database, client).runPullSync()
    syncTrace(
      `cycle#${id} pull done rows=${observed.rows} networkFailure=${observed.networkFailure} ` +
        `error=${observed.error === null ? 'none' : 'yes'}`,
    )

    if (observed.networkFailure) status.setOffline(true)
    else status.setOffline(false)

    if (observed.error !== null) {
      // Mirrors the drain-side guard above: a network failure must never
      // surface as a user-visible `lastError` — only a non-network pull error
      // should. `setOffline(true)` a few lines up already recorded the real
      // cause.
      if (!observed.networkFailure) {
        status.setLastError(
          observed.error instanceof Error ? observed.error.message : String(observed.error),
        )
      }
      syncTrace(`cycle#${id} exit reason=pull-error`)
      return {
        trigger: options.trigger,
        skipped: null,
        drain,
        pulled: false,
        pulledRows: 0,
        error: observed.error,
      }
    }

    status.recordPull(observed.rows)
    status.markSynced(Date.now())
    await publishQueueState(options.database)
    syncTrace(`cycle#${id} exit reason=ok rows=${observed.rows}`)

    return {
      trigger: options.trigger,
      skipped: null,
      drain,
      pulled: true,
      pulledRows: observed.rows,
      error: null,
    }
  } finally {
    // Phase 2 lives in the `finally` and nowhere else (STOURIFY-29).
    //
    // Two rules meet here, and they point in opposite directions:
    //
    //   * A photo must never delay incoming data (design spec §2.3 rule 3).
    //     Satisfied by position: this runs after the pull attempt on every
    //     path, so nothing above it ever waits on an upload. Do not hoist it.
    //
    //   * Nothing may delay a photo except its own host row not being on the
    //     server yet — which `drainPendingMedia` checks per row in
    //     `isHostAcked`. Satisfied by `finally`: the language guarantees this
    //     runs, so no early return above can jump over it.
    //
    // The second rule is the one that was broken. The old code sat this call
    // in the success path, below the `return` on a failed pull, under a
    // comment claiming it was "OUTSIDE the gate" — true of the `fullyAcked`
    // gate, false of the pull's own error path. A dev backend answering `500`
    // on the delta endpoint therefore held a user's photos for as long as it
    // kept failing: no error, no failure count, nothing on the Sync Status
    // screen. They uploaded the moment the pull started working.
    //
    // An ordinary statement placed anywhere else would fix today's four exits
    // and none of tomorrow's. `finally` is what makes it structural.
    syncTrace(`cycle#${id} media start`)
    await runMediaPhase(options.database)
    syncTrace(`cycle#${id} media done`)

    syncTrace(`cycle#${id} post-outbox start`)
    await runPostOutboxPhase(options.database)
    syncTrace(`cycle#${id} post-outbox done`)

    // Idempotent, and covers every exit path — including an uncaught
    // exception from `drainOutbox`/`publishQueueState` (e.g. a local DB read
    // failure that is not one of the handled network-failure cases). Without
    // this in `finally`, such an error frees the mutex but leaves `phase`
    // stuck at `'draining'`/`'pulling'` until some later cycle happens to
    // overwrite it — the UI would show a sync in progress indefinitely.
    status.setPhase('idle')
    inFlight = false
    holderTrigger = null

    // The closing half of the pair. Read the log by matching `enter` against
    // `end` on the same number: an `enter` with no `end` is a cycle that never
    // came back, and the phase line above it says which step it is still
    // sitting in. That pairing is the whole readability of this trace, which is
    // why this line is inside the `finally` — an early return, or a throw from
    // anywhere above, must not be able to skip it.
    syncTrace(`cycle#${id} end elapsed=${Date.now() - startedAt}ms`)
  }
}
