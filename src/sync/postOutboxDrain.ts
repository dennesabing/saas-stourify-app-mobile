import { Q, type Database } from '@nozbe/watermelondb'
import axios from 'axios'
import type PostOutbox from '@/db/models/PostOutbox'
import { deleteDraftPhotos } from '@/features/social/api/draftPhotoStore'
import { uploadPostMedia } from '@/features/social/api/uploadPostMedia'
import { createPost, publishPost, type CreatePostInput } from '@/shared/api/posts'

export interface PostOutboxDrainOutcome {
  /** Entries this pass actually tried to send. */
  attempted: number
  published: number
  /** Entries the server refused; they now wait for a person, not for a signal. */
  failed: number
  networkFailure: boolean
}

const IDLE: PostOutboxDrainOutcome = {
  attempted: 0,
  published: 0,
  failed: 0,
  networkFailure: false,
}

/**
 * The same test `mediaDrain` uses, and for the same reason: the calls below go
 * through the shared Sanctum client or bare axios, neither of which carries
 * offline-sync-core's own network-failure marker. A response-less axios error
 * IS axios's definition of "this request never reached a server" — a timeout, a
 * DNS failure, a dropped radio.
 */
function isNetworkFailure(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response === undefined
}

function messageFor(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined
    return data?.message ?? error.message
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * Sends one queued post, from wherever the last attempt got to.
 *
 * The three steps are the ones `PostComposeScreen` performs inline — create
 * unpublished, upload each photo, publish — and the order is not negotiable:
 * publishing last is what stops a post going live with half its pictures, and
 * `publish` is idempotent so finishing later is always safe.
 *
 * The `post_uuid` write between step one and step two is the important line in
 * this function. It is what makes a second attempt continue rather than create
 * another post.
 */
async function sendOne(database: Database, row: PostOutbox): Promise<void> {
  let postUuid = row.postUuid

  if (postUuid === null) {
    // `visibility` is a plain string in the local row — the database has no
    // enum — so it is narrowed here rather than at every read. A row can only
    // ever have been written from the compose screen's own picker.
    const payload: CreatePostInput = {
      visibility: row.visibility as CreatePostInput['visibility'],
      publish: false,
    }
    if (row.caption !== '') payload.caption = row.caption
    if (row.spotUuid !== null) payload.spot_uuid = row.spotUuid

    const post = await createPost(payload)
    postUuid = post.uuid

    await database.write(async () => {
      await row.update((r: any) => {
        r._setRaw('post_uuid', post.uuid)
      })
    })
  }

  await uploadPostMedia(postUuid, row.media, {
    // The row's own id, plus the photo's position. Stable for the life of the
    // entry, which is exactly what makes a repeated attach collapse into one
    // media row instead of two.
    idempotencyKeyFor: (index) => `${row.id}-${index}`,
  })

  await publishPost(postUuid)
}

/**
 * One pass over the send-later queue (STOURIFY-161).
 *
 * A postman emptying a box: take what is in it, deliver what can be delivered,
 * and put nothing back that was never picked up.
 *
 * Runs inside `runSyncCycle`'s `finally`, beside the media drain, so it happens
 * on every cycle whatever the pull did — and cycles start on regaining
 * connectivity, on the app coming to the foreground, and on any manual sync.
 * Three ways in, deliberately: STOURIFY-134 is an open bug where the app's own
 * online flag can stay stuck at offline after a real reconnect, so a queue that
 * depended on the connectivity trigger alone would depend on the one signal
 * known to be unreliable.
 *
 * **A network failure stops the pass.** Not because retrying is harmful, but
 * because the second entry is about to fail in precisely the same way — there
 * is no radio — and a queue of ten posts would spend ten doomed requests
 * learning it once.
 *
 * **A rejection does not.** The server answered; the next entry might be fine.
 */
export async function drainPostOutbox(database: Database): Promise<PostOutboxDrainOutcome> {
  const rows = await database
    .get<PostOutbox>('post_outbox')
    .query(Q.where('state', 'queued'))
    .fetch()

  if (rows.length === 0) return IDLE

  const queue = rows.slice().sort((a, b) => a.createdAt - b.createdAt)

  let attempted = 0
  let published = 0
  let failed = 0
  let networkFailure = false

  for (const row of queue) {
    attempted += 1

    try {
      await sendOne(database, row)
    } catch (error) {
      if (isNetworkFailure(error)) {
        // Nothing is recorded against the entry: there is no signal, which is
        // not the post's fault and is not worth showing anybody as an error.
        // Whatever progress was made — a `post_uuid`, an attached photo — is
        // already written down, so the next pass carries on from there.
        networkFailure = true
        break
      }

      failed += 1
      await database.write(async () => {
        await row.update((r: any) => {
          r._setRaw('state', 'failed')
          r._setRaw('attempts', row.attempts + 1)
          r._setRaw('last_error', messageFor(error))
        })
      })
      continue
    }

    published += 1

    // The row and the photo copies together. The bytes are on the server now,
    // so keeping the local copies fills the phone with pictures nothing will
    // ever read — the documented failure mode of the media outbox's cleanup.
    const media = row.media
    await database.write(async () => {
      await row.destroyPermanently()
    })
    await deleteDraftPhotos(media)
  }

  return { attempted, published, failed, networkFailure }
}
