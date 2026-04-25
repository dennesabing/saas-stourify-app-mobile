import { client } from './client'
import type { User } from './types'

export async function getUser(uuid: string): Promise<User> {
  const res = await client.get(`/users/${uuid}`)
  return res.data.data
}

export async function updateProfile(data: {
  name?: string
  bio?: string
}): Promise<User> {
  const res = await client.put('/user/profile', data)
  return res.data.data
}
