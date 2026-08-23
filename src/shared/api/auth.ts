import { client } from './client'
import type { AuthConfig, User } from './types'

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: User }> {
  const res = await client.post('/login', { email, password })
  return res.data.data
}

export async function register(
  name: string,
  email: string,
  password: string,
  password_confirmation: string,
  code?: string,
): Promise<{ token: string; user: User }> {
  const payload: Record<string, string> = { name, email, password, password_confirmation }
  if (code !== undefined && code !== '') payload.code = code

  const res = await client.post('/register', payload)
  return res.data.data
}

export async function logout(): Promise<void> {
  await client.post('/logout')
}

export async function getMe(): Promise<User> {
  const res = await client.get('/user')
  return res.data.data
}

/**
 * Read before rendering the register form.
 *
 * When `invitation_only` is true the server requires a `code` field; a form that
 * does not collect it fails validation on a field the user was never shown.
 * When `registration_enabled` is false, `POST /register` returns 404.
 */
export async function getAuthConfig(): Promise<AuthConfig> {
  const res = await client.get('/auth/config')
  return res.data.data
}

/** Always succeeds, whether or not the address exists — do not leak account existence. */
export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await client.post('/forgot-password', { email })
  return { message: res.data.message }
}

export async function resetPassword(input: {
  token: string
  email: string
  password: string
  password_confirmation: string
}): Promise<{ message: string }> {
  const res = await client.post('/reset-password', input)
  return { message: res.data.message }
}
