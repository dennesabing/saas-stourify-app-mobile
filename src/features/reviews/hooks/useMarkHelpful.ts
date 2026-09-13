import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setReviewHelpful } from '@/shared/api/reviews'
import type { PaginatedResponse, Review } from '@/shared/api/types'

/**
 * "Helpful · N" on a review (STOURIFY-293) — **online only**.
 *
 * A vote is a note handed across a counter, not a letter dropped in a postbox:
 * it happens while you are there or not at all. Reactions are not a synced
 * table, so there is no queue to put a vote in, and inventing one here would
 * be a second sync engine. So with no signal the vote says it could not reach
 * the server and changes nothing.
 *
 * On success it writes the server's own count back into `['spot-reviews', id]`
 * — the key the reviews list and the spot page's Reviews tab share — so both
 * show the number the server now holds rather than a guess of ours.
 */
export function useMarkHelpful(spotUuid: string) {
  const queryClient = useQueryClient()
  const [failedUuid, setFailedUuid] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: ({ uuid, helpful }: { uuid: string; helpful: boolean }) =>
      setReviewHelpful(uuid, helpful),
    onMutate: ({ uuid }) => {
      setFailedUuid((current) => (current === uuid ? null : current))
    },
    onSuccess: (result, { uuid }) => {
      queryClient.setQueryData<PaginatedResponse<Review>>(['spot-reviews', spotUuid], (old) =>
        old
          ? {
              ...old,
              data: old.data.map((review) =>
                review.uuid === uuid
                  ? {
                      ...review,
                      helpful_count: result.helpful_count,
                      marked_helpful: result.helpful,
                    }
                  : review,
              ),
            }
          : old,
      )
    },
    onError: (_error, { uuid }) => setFailedUuid(uuid),
  })

  return {
    /** Ask for the opposite of what this review shows now. */
    toggle: (review: Pick<Review, 'uuid' | 'marked_helpful'>) =>
      mutation.mutate({ uuid: review.uuid, helpful: !review.marked_helpful }),
    /** The review whose vote is on its way, so its button can wait. */
    pendingUuid: mutation.isPending ? (mutation.variables?.uuid ?? null) : null,
    /** The review whose last vote did not arrive, so it can say so. */
    failedUuid,
  }
}
