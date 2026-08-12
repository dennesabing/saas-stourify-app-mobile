import { client } from './client'
import type { User } from './types'

/**
 * The platform account — name, email, avatar. NOT the explorer identity.
 *
 * `updateProfile()` used to live here and sent `PUT /user/profile`, an address
 * no route file in the project declares, so every save was a 404 (STOURIFY-38).
 * It is gone rather than fixed: the explorer identity is written at
 * `PATCH /profile` (`shared/api/profiles.ts` → `updateMyProfile`), and the
 * account's own display name and email are written at `PUT /me` — two different
 * endpoints, neither of them this one.
 */
export async function getUser(uuid: string): Promise<User> {
  const res = await client.get(`/users/${uuid}`)
  return res.data.data
}
