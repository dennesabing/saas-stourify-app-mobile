import { client } from './client'
import type { AccountSettings } from './types'

export async function getAccountSettings(): Promise<AccountSettings> {
  const res = await client.get('/settings/account')
  return res.data.data
}

export async function updateAccountSettings(data: Partial<AccountSettings>): Promise<AccountSettings> {
  const res = await client.put('/settings/account', data)
  return res.data.data
}
