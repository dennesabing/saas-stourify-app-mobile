import { Q, type Database } from '@nozbe/watermelondb'
import type { Observable } from 'rxjs'
import type PendingMedia from '@/db/models/PendingMedia'
import { discardMediaRow } from '@/sync/queue'
import { queueLocalMedia } from './queueLocalMedia'

/**
 * The morph alias every photo captured in the Create flow is destined for.
 * Matches `AllowedMorph` server-side and `HOST_TABLES` in `sync/mediaDrain.ts`.
 */
export const DRAFT_HOST_TYPE = 'stourify_spot'

/**
 * The `host_uuid` a photo carries before it belongs to anything.
 *
 * `pending_media.host_uuid` is a non-optional column, so "not yet bound" needs
 * a value rather than a null. The empty string is that value, and it is
 * deliberately one no host row can ever have: the media drain resolves a host
 * with `database.get('sto_spots').find(hostUuid)`, which throws for `''`, so
 * an unbound row is counted `skipped` and simply waits. No gating code was
 * added for this — see design spec §2.3 rule 3, which forbids exactly that.
 *
 * Publish is what binds it (STOURIFY-5). Until then the photo is durable,
 * local, and going nowhere.
 */
export const DRAFT_HOST_UUID = ''

/**
 * How many photos one spot draft may carry.
 *
 * Enforced here, at the point of capture, rather than at publish: a cap the
 * user only meets at the end is a cap that silently discards work they already
 * did.
 */
export const MAX_DRAFT_PHOTOS = 3

export interface DraftPhotoInput {
  /** The camera or picker URI — an OS cache entry, never stored as-is. */
  uri: string
  filename: string
  mime: string
}

function draftQuery(database: Database) {
  return database
    .get<PendingMedia>('pending_media')
    .query(Q.where('host_uuid', DRAFT_HOST_UUID), Q.sortBy('created_at', Q.asc))
}

/**
 * Copies the bytes into app-private storage and records an unbound
 * `pending_media` row.
 *
 * The copy is the whole point: the camera hands back a URI into OS-owned cache
 * that Android may reclaim at will, so a photo that survives an app kill has to
 * be a copy the app owns (design spec §2.3 rule 4). `queueLocalMedia` already
 * does that work — this is only the draft-shaped call in front of it.
 */
export async function queueCapturedPhoto(
  database: Database,
  input: DraftPhotoInput,
): Promise<string> {
  return queueLocalMedia(database, {
    hostType: DRAFT_HOST_TYPE,
    hostUuid: DRAFT_HOST_UUID,
    ...input,
  })
}

/** The unbound photos, oldest first — the order they were captured in. */
export async function listDraftMedia(database: Database): Promise<PendingMedia[]> {
  return draftQuery(database).fetch()
}

/**
 * The same list, as a stream.
 *
 * The review strip subscribes rather than re-fetching on focus: removing a
 * photo has to update the strip and the counter, and a focus-driven refetch
 * would not fire for a change made on the screen you are already looking at.
 */
export function observeDraftMedia(database: Database): Observable<PendingMedia[]> {
  return draftQuery(database).observe()
}

/**
 * Drops a draft photo — **the file as well as the row**.
 *
 * Delegating to `discardMediaRow` is deliberate. It is the same delete the Sync
 * Status screen's Discard performs (§2.4), and two implementations of one
 * cleanup rule drift; the half that drifts is always the file half, and the
 * symptom is app-private storage filling with copies nothing will ever collect.
 */
export async function removeDraftMedia(database: Database, id: string): Promise<void> {
  await discardMediaRow(database, id)
}
