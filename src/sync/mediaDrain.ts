import { Q, type Database } from '@nozbe/watermelondb'
import axios from 'axios'
import { File } from 'expo-file-system'
import type PendingMedia from '@/db/models/PendingMedia'
import { attachMedia, putFile, requestUploadUrl } from '@/shared/api/media'
import { stripImageMetadata } from '@/shared/media/stripImageMetadata'

export interface MediaDrainOutcome {
  /** Rows whose host was acked and were actually attempted this pass. */
  attempted: number
  uploaded: number
  failed: number
  /** Rows held back because their host row is still dirty — picked up next cycle. */
  skipped: number
  networkFailure: boolean
}

const IDLE_MEDIA_DRAIN: MediaDrainOutcome = {
  attempted: 0,
  uploaded: 0,
  failed: 0,
  skipped: 0,
  networkFailure: false,
}

/**
 * Morph alias -> local WatermelonDB table, matching `AllowedMorph` server-side
 * (`schema.ts:185-186`). Only hosts M4a actually queues media against belong
 * here; an unknown alias is treated as never-acked so the row simply waits
 * rather than crashing the drain.
 */
const HOST_TABLES: Record<string, string> = {
  stourify_spot: 'sto_spots',
}

/**
 * Rule 1 (design spec §2.3): `attach` resolves the host by `model_uuid`, so
 * the host row must exist server-side first. The client mints the uuid before
 * the local write and the push preserves it, so the uuid is valid the moment
 * the row's local `_status` reads `synced` — never before.
 */
async function isHostAcked(
  database: Database,
  hostType: string,
  hostUuid: string,
): Promise<boolean> {
  const table = HOST_TABLES[hostType]
  if (table === undefined) return false

  try {
    const host = await database.get(table).find(hostUuid)
    return ((host._raw as Record<string, unknown>)._status as string) === 'synced'
  } catch {
    // The host row doesn't exist locally (yet, or was discarded) — nothing to
    // attach to. Leave the media row alone; it retries next cycle.
    return false
  }
}

/**
 * `requestUploadUrl`/`putFile`/`attachMedia` go through the shared `client`
 * (Sanctum-authenticated) or bare `axios` (the presigned PUT) — neither
 * carries the offline-sync-core network-failure marker `isNetworkFailure`
 * reads. A response-less axios error IS axios's own definition of "the
 * request never reached a server" (timeout, DNS failure, dropped radio).
 */
function isMediaNetworkFailure(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response === undefined
}

function messageFor(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined
    return data?.message ?? error.message
  }
  return error instanceof Error ? error.message : String(error)
}

async function deleteLocalFile(path: string): Promise<void> {
  try {
    const file = new File(path)
    if (file.exists) file.delete()
  } catch {
    // Already gone — nothing left to clean up.
  }
}

/**
 * Phase 2 of the drain: presign -> PUT -> attach -> clean up, for every
 * pending photo whose host row has already been acked.
 *
 * MUST be called AFTER the pull, and MUST NOT be allowed to affect
 * `fullyAcked` or block the pull in any cycle — see design spec §2.3 rule 3
 * and the wiring + comment in `cycle.ts`. A photo is not a row edit; no
 * incoming delta can destroy it, so a stuck upload has no business stalling
 * the pull the way a rejected row does.
 */
export async function drainPendingMedia(database: Database): Promise<MediaDrainOutcome> {
  const rows = await database
    .get<PendingMedia>('pending_media')
    .query(Q.where('state', 'pending'))
    .fetch()

  if (rows.length === 0) return IDLE_MEDIA_DRAIN

  let attempted = 0
  let uploaded = 0
  let failed = 0
  let skipped = 0
  let networkFailure = false

  for (const row of rows) {
    if (!(await isHostAcked(database, row.hostType, row.hostUuid))) {
      skipped += 1
      continue
    }

    attempted += 1

    try {
      const presigned = await requestUploadUrl({
        filename: row.filename,
        contentType: row.mime,
        size: row.size,
        modelType: row.hostType,
        modelUuid: row.hostUuid,
      })

      // Stripped a second time, on purpose. `queueLocalMedia` already strips
      // the copy it writes, so for anything queued by this build there is
      // nothing left to remove and this is a no-op. The outbox outlives an app
      // update, though: a photo queued by an EARLIER build is sitting on disk
      // with its coordinates intact, and this is the last moment before those
      // bytes become a public URL (STOURIFY-40).
      const bytes = stripImageMetadata(await new File(row.localPath).bytes())

      await putFile(presigned.url, presigned.headers, bytes)

      await attachMedia({
        key: presigned.key,
        // The row's own id, minted by `queueLocalMedia` as a uuidv4 and stable
        // for the row's whole life — so every retry of THIS photo carries the
        // same token and the server can collapse them into one media row. No
        // new column is needed: the identity already exists.
        idempotencyKey: row.id,
        modelType: row.hostType,
        modelUuid: row.hostUuid,
      })

      await deleteLocalFile(row.localPath)
      await database.write(async () => {
        await row.destroyPermanently()
      })
      uploaded += 1
    } catch (error) {
      if (isMediaNetworkFailure(error)) {
        // Mirrors `drainOutbox`'s treatment of a dropped radio (`pushService.ts:416-421`):
        // the file and the row are untouched, `attempts` is not bumped, and
        // the row retries next cycle exactly as it is.
        //
        // STOURIFY-28: this branch is ALSO reached when the attach committed
        // server-side and only its response was lost — axios reports both as a
        // response-less error and nothing here can tell them apart. Retrying is
        // still right (dropping the photo on a dropped radio would be worse),
        // so the duplicate it used to cause is prevented at the other end, by
        // the `idempotencyKey` sent above. Do not "fix" this by giving up on
        // retry, and do not assume a row in this state was never uploaded.
        networkFailure = true
        continue
      }

      failed += 1
      const message = messageFor(error)
      await database.write(async () => {
        await row.update((r: any) => {
          r._setRaw('state', 'failed')
          r._setRaw('attempts', row.attempts + 1)
          r._setRaw('last_error', message)
        })
      })
    }
  }

  return { attempted, uploaded, failed, skipped, networkFailure }
}
