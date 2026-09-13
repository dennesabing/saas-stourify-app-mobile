import { useCallback } from 'react'
import { useDatabase } from '@nozbe/watermelondb/react'
import { useQueryClient } from '@tanstack/react-query'
import {
  removeLocalWishlistItem,
  type RemoveLocalWishlistItemTarget,
} from '@/features/spots/api/removeLocalWishlistItem'
import { WISHLIST_QUERY_KEY, type WishlistItem as ServerSave } from '@/shared/api/wishlist'

/**
 * Unsaves a spot, and makes every list of your saves agree at once
 * (STOURIFY-303).
 *
 * The phone's write is `removeLocalWishlistItem`. The second half is the
 * server's list as React Query remembers it: the Wishlist screen and the
 * Profile tab draw that copy, and until the sync has told the server, the copy
 * still holds the save. So it is taken out of the copy too. `useSavedSpots`
 * separately hides anything marked for removal, which covers a fetch that lands
 * before the server has heard.
 */
export function useUnsaveSpot() {
  const database = useDatabase()
  const queryClient = useQueryClient()

  return useCallback(
    async (target: RemoveLocalWishlistItemTarget) => {
      await removeLocalWishlistItem(database, target)

      queryClient.setQueryData<ServerSave[]>(WISHLIST_QUERY_KEY, (saves) =>
        saves?.filter(
          (save) =>
            save.uuid !== target.saveUuid &&
            !(target.spotUuid && save.spot?.uuid === target.spotUuid),
        ),
      )
    },
    [database, queryClient],
  )
}
