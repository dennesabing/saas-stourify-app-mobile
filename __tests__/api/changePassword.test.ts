jest.mock('@/shared/api/client', () => ({ client: { put: jest.fn(), delete: jest.fn() } }))

import { client } from '@/shared/api/client'
import { changePassword } from '@/shared/api/account'

/**
 * `PUT /api/v1/me/password` (STOURIFY-302). The server's `UpdatePasswordRequest`
 * reads exactly these three names, and its `confirmed` rule needs the third to
 * be called `password_confirmation` — a request with any other spelling is
 * refused as a mismatch however carefully the person typed.
 */
beforeEach(() => jest.clearAllMocks())

it('sends the three fields the server reads, as a PUT to /me/password', async () => {
  ;(client.put as jest.Mock).mockResolvedValue({ data: { message: 'ok' } })

  await changePassword({
    current_password: 'fixture-current',
    password: 'fixture-next-1',
    password_confirmation: 'fixture-next-1',
  })

  expect(client.put).toHaveBeenCalledWith('/me/password', {
    current_password: 'fixture-current',
    password: 'fixture-next-1',
    password_confirmation: 'fixture-next-1',
  })
})

it('lets a refusal through to the screen rather than swallowing it', async () => {
  const refusal = new Error('refused')
  ;(client.put as jest.Mock).mockRejectedValue(refusal)

  await expect(
    changePassword({ current_password: 'a', password: 'b', password_confirmation: 'b' }),
  ).rejects.toBe(refusal)
})
