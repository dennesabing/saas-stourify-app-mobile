import type { Database } from '@nozbe/watermelondb'
import { Directory, File, Paths } from 'expo-file-system'
import type PendingMedia from '@/db/models/PendingMedia'
import { stripImageMetadata } from '@/shared/media/stripImageMetadata'
import { uuidv4 } from '@/shared/utils/uuid'

export interface QueueLocalMediaInput {
  /** Morph alias, e.g. 'stourify_spot' */
  hostType: string
  hostUuid: string
  /** The picker/camera URI. */
  uri: string
  filename: string
  mime: string
}

/**
 * The app-private outbox directory, under the document directory — never the
 * cache directory. `documentDirectory` is "a place to store files that are
 * safe from being deleted by the system"; `cacheDirectory` is explicitly the
 * opposite, and the picker URI itself already lives in OS-owned cache. See
 * design spec §2.3 rule 4.
 */
const OUTBOX_DIR_NAME = 'media-outbox'

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot) : ''
}

/**
 * Copies the picker/camera bytes into app-private storage and records a
 * `pending_media` row pointing at the COPY.
 *
 * The picker URI is an OS-owned cache entry the system may reclaim; copying
 * it first is what makes a captured photo survive an app kill while offline
 * (design spec §2.3 rule 4). The copy is named by the new row's id so a
 * later cleanup (discard, or drain success) is unambiguous — one id, one
 * file, one row.
 *
 * The copy is made by hand — read, strip, write — rather than with the
 * filesystem's own `copy()`, and that is the whole of STOURIFY-40. A camera
 * writes the coordinates it was standing on into the photo file, and this
 * outbox copy is the earliest moment the app owns those bytes. Stripping here,
 * rather than at drain time, is what stops a queued photo sitting on disk with
 * someone's home address in it for however long they are offline.
 *
 * If the bytes cannot be read or the JPEG cannot be walked, this throws and no
 * row is written. That is deliberate: the caller already reports "that photo
 * could not be saved", and a photo the app could not inspect is not one it
 * should queue for a public URL.
 */
export async function queueLocalMedia(
  database: Database,
  input: QueueLocalMediaInput,
): Promise<string> {
  const id = uuidv4()

  const outbox = new Directory(Paths.document, OUTBOX_DIR_NAME)
  // `idempotent: true` — safe to call every time; it must not throw just
  // because a previous queue already created this directory.
  outbox.create({ intermediates: true, idempotent: true })

  const destination = new File(outbox, `${id}${extensionOf(input.filename)}`)
  const stripped = stripImageMetadata(await new File(input.uri).bytes())
  destination.write(stripped)

  await database.write(async () => {
    await database.get<PendingMedia>('pending_media').create((row: any) => {
      row._raw.id = id
      row._raw.host_type = input.hostType
      row._raw.host_uuid = input.hostUuid
      row._raw.local_path = destination.uri
      row._raw.filename = input.filename
      row._raw.mime = input.mime
      // The stripped length, not the original's — the file on disk is the
      // stripped copy, and this number is what the presign step advertises.
      row._raw.size = stripped.length
      row._raw.state = 'pending'
      row._raw.attempts = 0
      row._raw.created_at = Date.now()
    })
  })

  return id
}
