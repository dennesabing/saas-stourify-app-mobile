import { client } from './client'
import type { PaginatedResponse } from './types'

/**
 * Blocking — `/api/v1/blocks`.
 *
 * Three calls and no more, matching the server's own surface
 * (`BlockApiController`): list the blocks I made, add one, lift one. There is
 * deliberately no way to ask who has blocked *me* — the endpoint does not
 * exist, because a block is invisible to the person blocked.
 *
 * **The consequence for this client is that a block is one-way visible.** Once
 * I block someone, `GET /profiles/{them}` answers 403 for me as well as for
 * them: the server refuses both parties identically so the difference cannot
 * announce the block. So nothing on their profile can ever offer Unblock — the
 * profile will not load. `getBlocks()` is the only surface that can, which is
 * why the Blocked accounts screen exists (STOURIFY-37).
 */

/** One row of the blocked list, as `BlockResource` renders it. */
export interface Block {
  /** The BLOCK row's uuid — what `unblockUser` takes. Not the user's. */
  uuid: string
  blocked?: BlockedExplorer
  created_at: string | null
  can?: Record<string, boolean>
}

/**
 * The blocked party, from `ExplorerResource`. No avatar and no email: that
 * resource sends neither, so the list renders an initial instead.
 */
export interface BlockedExplorer {
  uuid: string
  name: string
  username: string | null
  bio: string | null
  is_private: boolean
}

/**
 * The blocks I have made — the Blocked accounts list.
 *
 * Never cached long on the server (the controller says so): this has to reflect
 * a block or unblock the instant it happens.
 */
export async function getBlocks(): Promise<PaginatedResponse<Block>> {
  const res = await client.get('/blocks')
  return res.data
}

/**
 * Block an explorer, by their USER uuid.
 *
 * Idempotent server-side: a second call on the same person answers 200 with the
 * row that already exists rather than tripping the unique index. Callers must
 * treat that as success — a double tap should feel like the first tap worked.
 *
 * Two side effects happen on the server and are worth knowing here, because the
 * UI has to describe them: the follow edges between the two accounts are
 * deleted in BOTH directions, and they are not restored by unblocking.
 */
export async function blockUser(userUuid: string): Promise<Block> {
  const res = await client.post('/blocks', { user_uuid: userUuid })
  return res.data.data
}

/**
 * Lift a block — addressed by the BLOCK row's uuid, not the user's.
 *
 * `DELETE /blocks?user_uuid=` does not exist. Take the uuid from a
 * `getBlocks()` row.
 */
export async function unblockUser(blockUuid: string): Promise<void> {
  await client.delete(`/blocks/${blockUuid}`)
}
