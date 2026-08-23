import { Directory, File, Paths } from 'expo-file-system'
import type { DraftMedia } from '@/db/models/PostDraft'

/**
 * Where a draft's photos are kept.
 *
 * Under the **document** directory, beside `media-outbox`, and never the cache
 * directory: the platform describes the document directory as a place for files
 * that are safe from being deleted by the system, and the cache directory as
 * explicitly the opposite. The address the photo picker hands over points into
 * the second one, which is the whole problem this module exists to fix
 * (STOURIFY-160).
 */
export const DRAFT_PHOTO_DIR_NAME = 'post-drafts'

/** The extension the copy gets when the picker gave no usable filename. */
const FALLBACK_EXTENSION = '.jpg'

function extensionOf(filename: string | undefined): string {
  if (filename === undefined) return FALLBACK_EXTENSION
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot) : FALLBACK_EXTENSION
}

/**
 * The folder, made if it is not there yet — or `null` if this device will not
 * give us one.
 *
 * `null` rather than a throw for the same reason a photo that cannot be read is
 * not a throw: whatever went wrong with storage, the caption must still be
 * saved. It also keeps this module usable in a test environment that has no
 * filesystem at all.
 */
function draftDirectory(): Directory | null {
  try {
    const directory = new Directory(Paths.document, DRAFT_PHOTO_DIR_NAME)
    // Idempotent: this runs on every save, and must not throw because an
    // earlier save already made the folder.
    directory.create({ intermediates: true, idempotent: true })
    return directory
  } catch {
    return null
  }
}

/** Is this address already one of our own copies? */
function isOurs(uri: string): boolean {
  return uri.includes(`/${DRAFT_PHOTO_DIR_NAME}/`)
}

/**
 * Copies a draft's photos into app-private storage and hands back the same list
 * pointing at the copies.
 *
 * Three behaviours are load-bearing, and each is a test:
 *
 * - **A photo already in our folder is left alone.** The auto-save runs every
 *   time the typing stops, and re-copying the same bytes on each pause would be
 *   absurd.
 * - **A photo whose bytes cannot be read keeps its original address**, and this
 *   function does not throw. That is the opposite of `queueLocalMedia`, which
 *   refuses to record a photo it could not read — correct there, because that
 *   copy is the one that gets uploaded to a public URL. Here, refusing would
 *   throw away the caption too, and the caption is what drafts exist to protect.
 * - **The bytes are copied as they are, not stripped.** `uploadPostMedia` takes
 *   the camera metadata off at upload time for this path (STOURIFY-40), so
 *   stripping here as well would change what gets published; and the strip
 *   throws on a file it cannot walk, which would turn a metadata problem into a
 *   lost draft.
 */
export async function copyDraftPhotos(
  draftId: string,
  photos: DraftMedia[],
): Promise<DraftMedia[]> {
  if (photos.length === 0) return photos

  const directory = draftDirectory()
  if (directory === null) return photos

  return Promise.all(
    photos.map(async (photo, index) => {
      if (isOurs(photo.uri)) return photo

      try {
        const bytes = await new File(photo.uri).bytes()
        const destination = new File(directory, `${draftId}-${index}${extensionOf(photo.fileName)}`)
        destination.write(bytes)

        return { ...photo, uri: destination.uri }
      } catch {
        return photo
      }
    }),
  )
}

/**
 * Deletes the copies belonging to a draft that is going away — on a manual
 * delete, and on the delete a successful share performs.
 *
 * It only ever deletes files in our own folder, so handing it a draft that was
 * never copied is harmless. A file that has already gone is a success, not an
 * error: this runs after a share, and nothing guarantees the file is still
 * there. Skipping the file half of a cleanup is the documented way this app's
 * private storage fills with copies nothing will ever read.
 */
export async function deleteDraftPhotos(photos: DraftMedia[]): Promise<void> {
  for (const photo of photos) {
    if (!isOurs(photo.uri)) continue

    try {
      new File(photo.uri).delete()
    } catch {
      // Already gone. Nothing to do, and nothing worth telling anybody.
    }
  }
}
