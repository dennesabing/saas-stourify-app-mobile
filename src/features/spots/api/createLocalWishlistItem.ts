import type { Database } from '@nozbe/watermelondb'
import type WishlistItem from '@/db/models/WishlistItem'
import { useAuthStore } from '@/shared/store/auth'
import { uuidv4 } from '@/shared/utils/uuid'

export interface CreateLocalWishlistItemInput {
  /** Almost always `null` — `SpotResource` never sends a numeric spot id, only `uuid`. */
  spotId: number | null
  spotUuid: string
  note?: string | null
}

/**
 * Writes a wishlist save straight to WatermelonDB. NEVER touches the network.
 *
 * Same shape as `createLocalReview.ts`: the uuid is minted here and becomes
 * both the row's local id and the key the server resolves the push by
 * (`uuid === id`). `_status` starts at `created` automatically, which is what
 * `pushService.ts`'s `sto_wishlist_items` branch drains.
 *
 * No loading state, no error state: a local write cannot fail for network
 * reasons.
 */
export async function createLocalWishlistItem(
  database: Database,
  input: CreateLocalWishlistItemInput,
): Promise<string> {
  const uuid = uuidv4()
  const now = Date.now()
  const userId = useAuthStore.getState().user?.id ?? null

  await database.write(async () => {
    await database.get<WishlistItem>('sto_wishlist_items').create((row: any) => {
      row._raw.id = uuid
      row._raw.uuid = uuid
      row._raw.user_id = userId === null ? null : Number(userId)
      row._raw.spot_id = input.spotId
      row._raw.spot_uuid = input.spotUuid
      row._raw.note = input.note ?? null
      row._raw.is_downloaded_offline = false
      row._raw.created_at = now
      row._raw.updated_at = now
    })
  })

  return uuid
}
