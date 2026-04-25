import { client } from './client'
import type { User } from './types'

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const res = await client.post('/login', { email, password })
  return res.data.data
}

export async function register(
  name: string,
  email: string,
  password: string,
  password_confirmation: string
): Promise<{ token: string; user: User }> {
  const res = await client.post('/register', { name, email, password, password_confirmation })
  return res.data.data
}

export async function logout(): Promise<void> {
  await client.post('/logout')
}

export async function getMe(): Promise<User> {
  const res = await client.get('/user')
  return res.data.data
}
