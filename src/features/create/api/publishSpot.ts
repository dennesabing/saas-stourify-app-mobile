import type { Database } from '@nozbe/watermelondb'
import type PendingMedia from '@/db/models/PendingMedia'
import type Spot from '@/db/models/Spot'
import { uuidv4 } from '@/shared/utils/uuid'
import { DRAFT_HOST_TYPE, MAX_DRAFT_PHOTOS, listDraftMedia } from '@/features/media/api/draftMedia'

export interface PublishSpotInput {
  title: string
  description: string
  latitude: number
  longitude: number
  /**
   * Free strings, exactly as `SpotStoreRequest` takes them. An empty list is
   * written as `null`, which is what `pushService` already sends for "none".
   */
  categories?: string[]
  /** The signed-in explorer's server id, or `null` while it is unknown. */
  userId: number | null
}

export interface PublishSpotResult {
  /** The client-minted uuid — the spot's identity, locally and server-side. */
  uuid: string
  /** How many captured photos were bound to it. */
  photoCount: number
}

/**
 * Writes the spot, PUBLISHED, and binds every captured photo to it, offline, in
 * one write.
 *
 * Three things about the shape of this function are load-bearing.
 *
 * **The uuid is minted before the write.** It is the row's identity and the key
 * the server resolves the push by, and `attach` later resolves the media host by
 * that same `model_uuid` (design spec §2.3 rule 1). Letting the server allocate
 * an id would make the bind below impossible: there would be nothing to bind to
 * until the spot had already reached a network, which is precisely the thing
 * this flow does not have.
 *
 * **The spot row and the bind are one batch.** Two separate writes would leave a
 * window in which a crash publishes a spot whose photos are pointed at nothing —
 * and `drainPendingMedia` skips an unbound row silently and forever, so that
 * partial publish would never surface as an error. One batch removes the window
 * rather than reporting on it.
 *
 * **Nothing here touches the network, and nothing gates the sync cycle.** The
 * rows are durable when this resolves; the drain picks them up on its own
 * schedule. Wiring publish into the pull gate is the specific edit design spec
 * §2.3 rule 3 forbids.
 */
export async function publishSpot(
  database: Database,
  input: PublishSpotInput,
): Promise<PublishSpotResult> {
  const uuid = uuidv4()
  const now = Date.now()
  const description = input.description.trim()
  // JSON text, because `categories` is a string column holding JSON — the
  // schema's own note explains why the sanitizer cannot be handed an array.
  const categories = (input.categories ?? []).map((category) => category.trim()).filter(Boolean)

  let photoCount = 0

  await database.write(async () => {
    // Read inside the write block: WatermelonDB serialises writers, so no photo
    // can be captured between this read and the batch below.
    const drafts = await listDraftMedia(database)

    if (drafts.length > MAX_DRAFT_PHOTOS) {
      // Reaching this means the capture-time cap failed. Trimming to fit would
      // discard a photo the user actually took, without telling them — so this
      // refuses instead, before anything is written.
      throw new Error(
        `A spot draft carries ${drafts.length} photos, past the cap of ${MAX_DRAFT_PHOTOS}.`,
      )
    }

    photoCount = drafts.length

    database.batch(
      database.get<Spot>('sto_spots').prepareCreate((row: any) => {
        row._raw.id = uuid
        row._raw.uuid = uuid
        row._raw.user_id = input.userId
        row._raw.title = input.title.trim()
        row._raw.description = description === '' ? null : description
        row._raw.latitude = input.latitude
        row._raw.longitude = input.longitude
        row._raw.categories = categories.length === 0 ? null : JSON.stringify(categories)
        // Published, not draft.
        //
        // This line read 'draft' until STOURIFY-202, and the word 'published'
        // appeared nowhere else in the app -- so every spot anyone ever created
        // was saved unfinished, pushed unfinished, and stayed unfinished
        // forever. Drafts are deliberately excluded from every discovery
        // surface, so the result was a catalogue nobody could browse or search,
        // including the person who built it. The app's whole purpose did not
        // work, and nothing anywhere reported a failure.
        //
        // The create flow has one finishing button and says nothing about
        // drafts, so publishing is what a person believes they are doing when
        // they press it. This makes the code agree with them. The operator
        // confirmed on 2026-08-26 that there is no save-as-draft option for now;
        // the draft state still exists on the server for when there is.
        row._raw.status = 'published'
        row._raw.is_verified = false
        row._raw.reviews_count = 0
        row._raw.saves_count = 0
        row._raw.created_at = now
        row._raw.updated_at = now
      }),
      ...drafts.map((photo: PendingMedia) =>
        photo.prepareUpdate((row: any) => {
          row._setRaw('host_uuid', uuid)
          // Re-asserted rather than assumed: capture is the only writer today,
          // but a host row bound to the wrong morph alias fails at `attach`,
          // on the server, minutes later and with no local trace.
          row._setRaw('host_type', DRAFT_HOST_TYPE)
        }),
      ),
    )
  })

  // The card's rule, stated as an invariant rather than a tolerance: an unbound
  // row surviving publish is a bug, not something to skip. It cannot happen
  // through the path above — which is exactly why a silent one would be
  // undiagnosable if it ever did.
  const stillUnbound = await listDraftMedia(database)
  if (stillUnbound.length > 0) {
    throw new Error(
      `Published spot ${uuid} left ${stillUnbound.length} unbound photo(s) in the outbox.`,
    )
  }

  return { uuid, photoCount }
}
