import { client } from './client'
import type { City } from './types'

/**
 * The explorer identity surface — `Modules\Stourify\Http\Resources\ProfileResource`.
 *
 * This is NOT the boilerplate's `User`. A `User` is a platform account (name,
 * email, avatar); an `ExplorerProfile` is the Stourify identity built on top of
 * it — username, bio, home city, interests, counts. `ProfileScreen` read
 * `GET /users/{uuid}` until STOURIFY-35, which is why it could never show a
 * username or a follower count: those fields have never been on that endpoint.
 */
export interface ExplorerProfile {
  uuid: string
  /** Present when the server loaded the `user` relation — it does on every read here. */
  user_uuid?: string
  /**
   * The display name from the platform account, same value `PostResource`
   * sends as `author.name`. Optional for the same reason as `user_uuid`: it is
   * `whenLoaded('user')` server-side.
   */
  name?: string
  username: string
  bio: string | null
  website: string | null
  /** Always an array, never null — `interests ?? []` server-side. */
  interests: string[]
  home_city: City | null
  is_private: boolean
  /** Owner-only; absent (not false) when reading somebody else. */
  shows_location_on_spots?: boolean
  counts: {
    spots: number
    followers: number
    following: number
  }
  viewer: ProfileViewerState
  created_at: string | null
  can: Record<string, boolean>
}

/**
 * The CALLER's relationship to the profile, not the profile's own state.
 *
 * `follow_status` is three-valued on purpose. `pending` is a request awaiting a
 * private account's approval — it renders "Requested", which is neither
 * following nor not-following, and treating it as the latter would offer to
 * send a request that already exists.
 *
 * `follow_uuid` addresses the edge itself, which is what `DELETE /follows/{uuid}`
 * needs; there is no `DELETE /follows?user_uuid=` on the server.
 */
export interface ProfileViewerState {
  is_self: boolean
  is_following: boolean
  follow_status: 'pending' | 'active' | null
  follow_uuid: string | null
}

/**
 * `GET /profile` — the caller's own.
 *
 * Resolves to `null`, not a 404, when the caller has registered but not yet
 * finished onboarding. "You have no profile yet" is a state the client renders,
 * so callers must handle `null` rather than treating it as a failed request.
 */
export async function getMyProfile(): Promise<ExplorerProfile | null> {
  const res = await client.get('/profile')
  return res.data.data ?? null
}

/**
 * `GET /profiles/{userUuid}` — anyone's public header, keyed by USER uuid (not
 * profile uuid).
 *
 * Two failures are ordinary rather than exceptional, and the screen renders
 * both: a 404 when that user never created a profile, and a 403 when a block
 * stands between the caller and the subject. The 403 is deliberately identical
 * from either side of the block — do not try to distinguish them.
 */
export async function getProfile(userUuid: string): Promise<ExplorerProfile> {
  const res = await client.get(`/profiles/${userUuid}`)
  return res.data.data
}

/**
 * The fields a client may write. Deliberately narrower than `ExplorerProfile`.
 *
 * Two absences are the point (STOURIFY-38). `name` is NOT here: a display name
 * belongs to the platform account and is written at `PUT /me`, so sending it
 * to this endpoint gets it silently dropped — which is half of the bug this
 * type exists to prevent recurring. The counts, `viewer` and `can` are not here
 * either: they are things the server computes about you, not things you set.
 *
 * `is_private` and `shows_location_on_spots` are accepted by the endpoint and
 * left out on purpose — see STOURIFY-57, which has to first settle whether
 * `is_private` and the Settings screen's `account_visibility` are one setting
 * or two.
 */
export interface ProfileWrite {
  username?: string
  bio?: string | null
  website?: string | null
  /** A CITY uuid, not the numeric `server_id` the local database also holds. */
  home_city_uuid?: string | null
  interests?: string[]
}

/**
 * `PATCH /profile` — create or edit the caller's own profile.
 *
 * One endpoint for both because the server treats it as an upsert: the first
 * save from someone who skipped onboarding creates the row, and every later
 * save edits it. That is what makes the profile header's "Set up profile"
 * button work with no separate create path.
 *
 * Send only what changed. `username` is `sometimes` on an established profile
 * precisely so a bio edit does not have to restate the handle — restating it
 * would let an unrelated uniqueness failure block a save that never touched it.
 *
 * A rejected save is ordinary rather than exceptional: the server answers 422
 * with per-field messages ("That username is taken.") that the caller is
 * expected to render against the field, via `extractValidationErrors`.
 */
export async function updateMyProfile(changes: ProfileWrite): Promise<ExplorerProfile> {
  const res = await client.patch('/profile', changes)
  return res.data.data
}
