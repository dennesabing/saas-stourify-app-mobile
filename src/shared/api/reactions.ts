import { client } from './client'

/**
 * The platform's generic reactions endpoint — one door for every kind of record.
 *
 * Think of a single suggestion box in a building's lobby, where each slip
 * carries the name of the department it is about. There is one box, not one per
 * department, and adding a department needs no new box. That is what
 * `/api/v1/reactions` is: a record becomes likeable by declaring a **morph
 * alias** — a short stable name for its type — and no endpoint changes.
 *
 * This is the app's first client for it. Every function here takes the alias as
 * an argument rather than hard-coding one, so the next feature that needs a
 * like uses this file instead of writing a second one.
 */

/**
 * What the server answers with, on all three of its reaction routes.
 *
 * `counts` is a map from reaction name to number — `{ like: 6 }` — and it comes
 * back as an empty object, not a missing key, once the last reaction is gone.
 * So `counts.like` is `undefined` rather than `0` on an unreacted record, and
 * the caller is the one that decides zero.
 */
export interface ReactionState {
  reacted: boolean
  mine: string | null
  counts: Record<string, number>
}

/**
 * Set the caller's reaction on a record.
 *
 * The host is addressed by alias plus UUID — never a numeric id, which no
 * Stourify response contains.
 *
 * One sharp edge worth knowing before reusing this: the server treats a POST of
 * the reaction you ALREADY hold as "take it back", so this is a toggle if you
 * call it twice. Callers state an intention instead — this to add, and
 * `removeReaction` to remove — because a toggle hands the decision to whichever
 * side has the staler idea of the current state, and that is usually the app.
 */
export async function addReaction(
  reactableType: string,
  reactableUuid: string,
  type = 'like',
): Promise<ReactionState> {
  const res = await client.post('/reactions', {
    reactable_type: reactableType,
    reactable_uuid: reactableUuid,
    type,
  })
  return res.data.data
}

/**
 * Take the caller's own reaction off a record. Idempotent — removing a reaction
 * that is not there succeeds and reports the same state.
 *
 * **The payload goes under `data`, and that is the whole subtlety of this
 * function.** A DELETE has no body position in axios' argument list, so a
 * payload written where `post` would put it becomes the *config* object and is
 * never transmitted. The failure is confusing rather than obvious: the server
 * answers 422 complaining that two required fields are missing, while the code
 * plainly reads as though it sent them.
 */
export async function removeReaction(
  reactableType: string,
  reactableUuid: string,
): Promise<ReactionState> {
  const res = await client.delete('/reactions', {
    data: { reactable_type: reactableType, reactable_uuid: reactableUuid },
  })
  return res.data.data
}
