import type { Database } from '@nozbe/watermelondb'
import type Review from '@/db/models/Review'
import { useAuthStore } from '@/shared/store/auth'
import { uuidv4 } from '@/shared/utils/uuid'

export interface CreateLocalReviewInput {
  /**
   * The reviewed spot's numeric server id, when it is already known locally
   * (e.g. the spot was pulled down and lives in `sto_spots` with a
   * `server_id`). Almost always `null` in practice: `SpotResource` never
   * sends a numeric id, only `uuid` — so the spot detail screen typically has
   * nothing to put here. Mirrors `Review.spotId` / `serializeForPush`'s
   * `spot_id` column.
   */
  spotId: number | null
  /** The reviewed spot's uuid — always known, and what the write is actually keyed on. */
  spotUuid: string
  rating: number
  body: string | null
}

/**
 * Writes a review straight to WatermelonDB. NEVER touches the network.
 *
 * Same shape as `CreateSpotScreen`'s local-write slice
 * (`src/features/create/screens/CreateSpotScreen.tsx`): the uuid is minted
 * here, before the write, and becomes both the row's local id and the key the
 * server resolves the push by (`uuid === id`). `_status` starts at `created`
 * automatically — WatermelonDB sets it on `collection.create()`, the same
 * dirty-tracking `pushService.ts`'s `collectDirtyBatch` already drains for
 * every pushable table, `sto_reviews` included
 * (`src/sync/pushService.ts`'s `sto_reviews` branch).
 *
 * No loading state, no error state: a local write cannot fail for network
 * reasons, so there is nothing here for a caller to await beyond the write
 * itself completing.
 *
 * Returns the new review's local id (its uuid), so a caller can navigate or
 * highlight the just-written row without a second query.
 */
export async function createLocalReview(
  database: Database,
  input: CreateLocalReviewInput,
): Promise<string> {
  const uuid = uuidv4()
  const now = Date.now()
  const userId = useAuthStore.getState().user?.id ?? null

  await database.write(async () => {
    await database.get<Review>('sto_reviews').create((row: any) => {
      row._raw.id = uuid
      row._raw.uuid = uuid
      row._raw.user_id = userId === null ? null : Number(userId)
      row._raw.spot_id = input.spotId
      row._raw.spot_uuid = input.spotUuid
      row._raw.rating = input.rating
      row._raw.body = input.body
      row._raw.helpful_count = 0
      row._raw.created_at = now
      row._raw.updated_at = now
    })
  })

  return uuid
}
